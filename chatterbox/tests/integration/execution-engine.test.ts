import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getDatabase, AppDatabase } from '../../src/core/storage/database.js';
import { TaskRepository } from '../../src/core/storage/repositories/task.repository.js';
import { TaskNodeRepository } from '../../src/core/storage/repositories/task-node.repository.js';
import { ArtifactRepository } from '../../src/core/storage/repositories/artifact.repository.js';
import { UsageRepository } from '../../src/core/storage/repositories/usage.repository.js';
import { EventStore } from '../../src/core/events/event-store.js';
import { EventBus } from '../../src/core/events/event-bus.js';
import { ArtifactService } from '../../src/core/artifacts/artifact.service.js';
import { ExecutionEngine } from '../../src/core/engine/execution-engine.js';
import { PlannerAgent } from '../../src/core/agents/planner/planner.agent.js';
import { MockPlannerProvider } from '../../src/core/llm/mock-planner-provider.js';
import { TaskNode } from '../../src/core/models/task-node.js';
import { getTimestamp } from '../../src/utils/time.js';
import { generateId } from '../../src/utils/ids.js';

describe('ExecutionEngine Integration Flow', () => {
  let tempDir: string;
  let db: AppDatabase;
  let taskRepo: TaskRepository;
  let taskNodeRepo: TaskNodeRepository;
  let artifactRepo: ArtifactRepository;
  let usageRepo: UsageRepository;
  let eventStore: EventStore;
  let eventBus: EventBus;
  let artifactService: ArtifactService;
  let engine: ExecutionEngine;
  const taskId = 'task_ee_integration_1';

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'agentfeed-ee-test-'));
    db = getDatabase(join(tempDir, 'test.db'));
    taskRepo = new TaskRepository(db);
    taskNodeRepo = new TaskNodeRepository(db);
    artifactRepo = new ArtifactRepository(db);
    usageRepo = new UsageRepository(db);
    eventStore = new EventStore(tempDir);
    eventBus = new EventBus(eventStore);
    artifactService = new ArtifactService(tempDir, artifactRepo, eventBus);

    const provider = new MockPlannerProvider();
    engine = new ExecutionEngine({
      taskRepo,
      taskNodeRepo,
      artifactService,
      eventBus,
      llmProvider: provider,
    });
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('runs complete flow: Planner -> Approval -> Specialist execution -> Done with competitive-brief.md (Test 11)', async () => {
    const goal = 'Create a competitive brief on AI-agent security startups';

    // 1. Create task
    const task = await taskRepo.create({
      id: taskId,
      title: 'Competitive Brief Task',
      goal,
      status: 'planning',
      createdBy: 'operator',
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    });

    await eventBus.publish({
      eventId: generateId('evt'),
      taskId,
      type: 'task_created',
      timestamp: getTimestamp(),
      actorType: 'user',
      actorId: 'operator',
      correlationId: generateId('corr'),
      payload: { goal: task.goal, title: task.title },
    });

    // 2. Planner proposes plan
    const planner = new PlannerAgent({
      provider: new MockPlannerProvider(),
      eventBus,
      usageRepo,
    });

    const plan = await planner.generatePlan({ taskId, goal });
    expect(plan.tasks.length).toBeGreaterThanOrEqual(4);

    // 3. Operator approves plan
    const now = getTimestamp();
    const taskNodes: TaskNode[] = plan.tasks.map((pt) => ({
      id: `${taskId}_${pt.id}`,
      taskId,
      title: pt.title,
      description: pt.description,
      assignedAgentRole: pt.assignedAgentRole,
      dependsOn: pt.dependsOn.map((d) => `${taskId}_${d}`),
      status: 'pending',
      acceptanceCriteria: pt.acceptanceCriteria,
      createdAt: now,
      updatedAt: now,
    }));

    await taskNodeRepo.createMany(taskNodes);
    await taskRepo.updateStatus(taskId, 'ready');

    await eventBus.publish({
      eventId: generateId('evt'),
      taskId,
      type: 'plan_approved',
      timestamp: getTimestamp(),
      actorType: 'user',
      actorId: 'operator',
      correlationId: generateId('corr'),
      payload: { approvedBy: 'operator' },
    });

    // 4. ExecutionEngine executes graph with mock specialists
    const result = await engine.runTask(taskId, {
      concurrency: 3,
      fast: true,
    });

    expect(result.taskStatus).toBe('done');
    expect(result.nodesCompleted).toBe(taskNodes.length);
    expect(result.nodesFailed).toBe(0);
    expect(result.nodesBlocked).toBe(0);

    // 5. Verify final deliverable exists
    expect(result.finalArtifact).toBeDefined();
    expect(result.finalArtifact?.path).toContain('competitive-brief.md');
    expect(existsSync(result.finalArtifact!.path)).toBe(true);

    const deliverableContent = await artifactService.readArtifactContent(result.finalArtifact!.id);
    expect(deliverableContent).toContain('Executive Summary');
    expect(deliverableContent).toContain('Comparison Table');
    expect(deliverableContent).toContain('Recommendations');

    // 6. Verify task in SQLite reached 'done'
    const updatedTask = await taskRepo.getById(taskId);
    expect(updatedTask?.status).toBe('done');

    // 7. Verify JSONL replay history is complete and replayable
    const replay = await eventStore.replayTask(taskId);
    expect(replay.status).toBe('done');
    expect(replay.eventCount).toBeGreaterThan(10);

    const eventTypes = replay.events.map((e) => e.type);
    expect(eventTypes).toContain('task_created');
    expect(eventTypes).toContain('planner_started');
    expect(eventTypes).toContain('plan_proposed');
    expect(eventTypes).toContain('plan_approved');
    expect(eventTypes).toContain('task_updated');
    expect(eventTypes).toContain('node_started');
    expect(eventTypes).toContain('agent_message');
    expect(eventTypes).toContain('tool_call_started');
    expect(eventTypes).toContain('tool_call_completed');
    expect(eventTypes).toContain('artifact_created');
    expect(eventTypes).toContain('node_completed');
    expect(eventTypes).toContain('task_completed');
  }, 30000);
});
