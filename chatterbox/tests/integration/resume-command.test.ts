import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getDatabase, AppDatabase } from '../../src/core/storage/database.js';
import { TaskRepository } from '../../src/core/storage/repositories/task.repository.js';
import { TaskNodeRepository } from '../../src/core/storage/repositories/task-node.repository.js';
import { ArtifactRepository } from '../../src/core/storage/repositories/artifact.repository.js';
import { EventStore } from '../../src/core/events/event-store.js';
import { EventBus } from '../../src/core/events/event-bus.js';
import { ArtifactService } from '../../src/core/artifacts/artifact.service.js';
import { ExecutionEngine } from '../../src/core/engine/execution-engine.js';
import { AgentRegistry } from '../../src/core/agents/runtime/agent-registry.js';
import { AgentRunner, AgentRunContext, AgentRunResult } from '../../src/core/agents/runtime/types.js';
import { createDefaultToolRegistry } from '../../src/core/tools/index.js';
import { MockPlannerProvider } from '../../src/core/llm/mock-planner-provider.js';
import { TaskNode } from '../../src/core/models/task-node.js';
import { getTimestamp } from '../../src/utils/time.js';

describe('Resume Execution Integration', () => {
  let tempDir: string;
  let db: AppDatabase;
  let taskRepo: TaskRepository;
  let taskNodeRepo: TaskNodeRepository;
  let artifactRepo: ArtifactRepository;
  let eventStore: EventStore;
  let eventBus: EventBus;
  let artifactService: ArtifactService;
  const taskId = 'task_resume_test_1';

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'agentfeed-resume-test-'));
    db = getDatabase(join(tempDir, 'test.db'));
    taskRepo = new TaskRepository(db);
    taskNodeRepo = new TaskNodeRepository(db);
    artifactRepo = new ArtifactRepository(db);
    eventStore = new EventStore(tempDir);
    eventBus = new EventBus(eventStore);
    artifactService = new ArtifactService(tempDir, artifactRepo, eventBus);

    await taskRepo.create({
      id: taskId,
      title: 'Interrupted Task',
      goal: 'Test resume semantics',
      status: 'running',
      createdBy: 'operator',
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    });
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('resume does not rerun completed nodes (Test 13)', async () => {
    const executedNodeIds: string[] = [];

    const countingRunner: AgentRunner = {
      role: 'analyst',
      async run(ctx: AgentRunContext): Promise<AgentRunResult> {
        executedNodeIds.push(ctx.nodeId);
        return {
          status: 'done',
          outputArtifactIds: [],
          messages: [],
          usage: { inputTokens: 5, outputTokens: 5 },
        };
      },
    };

    const registry = new AgentRegistry();
    registry.register('analyst', countingRunner);

    // Node 1 is already 'done' (simulating a node completed before interruption)
    const node1: TaskNode = {
      id: `${taskId}_n1`,
      taskId,
      title: 'Already Completed Node',
      assignedAgentRole: 'analyst',
      dependsOn: [],
      status: 'done',
      acceptanceCriteria: [],
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    };

    // Node 2 is 'pending' and depends on Node 1
    const node2: TaskNode = {
      id: `${taskId}_n2`,
      taskId,
      title: 'Pending Node',
      assignedAgentRole: 'analyst',
      dependsOn: [node1.id],
      status: 'pending',
      acceptanceCriteria: [],
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    };

    // Node 3 was 'running' when the process was killed
    const node3: TaskNode = {
      id: `${taskId}_n3`,
      taskId,
      title: 'Interrupted Running Node',
      assignedAgentRole: 'analyst',
      dependsOn: [node1.id],
      status: 'running',
      acceptanceCriteria: [],
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    };

    await taskNodeRepo.createMany([node1, node2, node3]);

    const engine = new ExecutionEngine({
      taskRepo,
      taskNodeRepo,
      artifactService,
      eventBus,
      llmProvider: new MockPlannerProvider(),
      agentRegistry: registry,
      toolRegistry: createDefaultToolRegistry(),
    });

    const result = await engine.resumeTask(taskId, {
      concurrency: 3,
      fast: true,
    });

    expect(result.taskStatus).toBe('done');
    expect(result.nodesCompleted).toBe(3);

    // CRITICAL ASSERTION: Node 1 was already done, so it must NEVER have been re-executed!
    expect(executedNodeIds).not.toContain(node1.id);
    expect(executedNodeIds).toContain(node2.id);
    expect(executedNodeIds).toContain(node3.id);
    expect(executedNodeIds.length).toBe(2);
  });
});
