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
import { createDefaultToolRegistry } from '../../src/core/tools/index.js';
import { AgentRegistry } from '../../src/core/agents/runtime/agent-registry.js';
import { AgentRunner, AgentRunContext, AgentRunResult, AgentError } from '../../src/core/agents/runtime/types.js';
import { MockPlannerProvider } from '../../src/core/llm/mock-planner-provider.js';
import { Scheduler } from '../../src/core/engine/scheduler.js';
import { TaskNode } from '../../src/core/models/task-node.js';
import { getTimestamp } from '../../src/utils/time.js';

describe('Scheduler & Dependency Resolver', () => {
  let tempDir: string;
  let db: AppDatabase;
  let taskRepo: TaskRepository;
  let taskNodeRepo: TaskNodeRepository;
  let artifactRepo: ArtifactRepository;
  let eventStore: EventStore;
  let eventBus: EventBus;
  let artifactService: ArtifactService;
  const taskId = 'task_scheduler_unit';

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'agentfeed-sched-test-'));
    db = getDatabase(join(tempDir, 'test.db'));
    taskRepo = new TaskRepository(db);
    taskNodeRepo = new TaskNodeRepository(db);
    artifactRepo = new ArtifactRepository(db);
    eventStore = new EventStore(tempDir);
    eventBus = new EventBus(eventStore);
    artifactService = new ArtifactService(tempDir, artifactRepo, eventBus);

    await taskRepo.create({
      id: taskId,
      title: 'Scheduler Test',
      goal: 'Validate scheduler semantics',
      status: 'ready',
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

  it('runs independent nodes in parallel (Test 1)', async () => {
    const activeRunning = new Set<string>();
    let maxParallel = 0;

    const parallelRunner: AgentRunner = {
      role: 'researcher',
      async run(ctx: AgentRunContext): Promise<AgentRunResult> {
        activeRunning.add(ctx.nodeId);
        maxParallel = Math.max(maxParallel, activeRunning.size);
        await new Promise((r) => setTimeout(r, 60));
        activeRunning.delete(ctx.nodeId);
        return {
          status: 'done',
          outputArtifactIds: [],
          messages: [],
          usage: { inputTokens: 10, outputTokens: 10 },
        };
      },
    };

    const registry = new AgentRegistry();
    registry.register('researcher', parallelRunner);

    const nodes: TaskNode[] = [
      {
        id: `${taskId}_node_a`,
        taskId,
        title: 'Node A',
        assignedAgentRole: 'researcher',
        dependsOn: [],
        status: 'pending',
        acceptanceCriteria: [],
        createdAt: getTimestamp(),
        updatedAt: getTimestamp(),
      },
      {
        id: `${taskId}_node_b`,
        taskId,
        title: 'Node B',
        assignedAgentRole: 'researcher',
        dependsOn: [],
        status: 'pending',
        acceptanceCriteria: [],
        createdAt: getTimestamp(),
        updatedAt: getTimestamp(),
      },
      {
        id: `${taskId}_node_c`,
        taskId,
        title: 'Node C',
        assignedAgentRole: 'researcher',
        dependsOn: [],
        status: 'pending',
        acceptanceCriteria: [],
        createdAt: getTimestamp(),
        updatedAt: getTimestamp(),
      },
    ];
    await taskNodeRepo.createMany(nodes);

    const scheduler = new Scheduler({
      taskId,
      goal: 'Parallel test',
      taskTitle: 'Scheduler Test',
      nodes,
      agentRegistry: registry,
      toolRegistry: createDefaultToolRegistry(),
      artifactService,
      eventBus,
      taskRepo,
      taskNodeRepo,
      llmProvider: new MockPlannerProvider(),
      concurrency: 3,
      fast: true,
    });

    const result = await scheduler.execute();

    expect(result.taskStatus).toBe('done');
    expect(result.nodesCompleted).toBe(3);
    // Verified: A, B, and C ran in parallel concurrently
    expect(maxParallel).toBeGreaterThanOrEqual(2);
  });

  it('dependent nodes wait for upstream completion (Test 2)', async () => {
    const executionOrder: string[] = [];

    const orderedRunner: AgentRunner = {
      role: 'analyst',
      async run(ctx: AgentRunContext): Promise<AgentRunResult> {
        executionOrder.push(ctx.node.title);
        await new Promise((r) => setTimeout(r, 20));
        return {
          status: 'done',
          outputArtifactIds: [],
          messages: [],
          usage: { inputTokens: 10, outputTokens: 10 },
        };
      },
    };

    const registry = new AgentRegistry();
    registry.register('analyst', orderedRunner);

    const node1: TaskNode = {
      id: `${taskId}_n1`,
      taskId,
      title: 'Step 1',
      assignedAgentRole: 'analyst',
      dependsOn: [],
      status: 'pending',
      acceptanceCriteria: [],
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    };
    const node2: TaskNode = {
      id: `${taskId}_n2`,
      taskId,
      title: 'Step 2',
      assignedAgentRole: 'analyst',
      dependsOn: [node1.id],
      status: 'pending',
      acceptanceCriteria: [],
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    };

    await taskNodeRepo.createMany([node1, node2]);

    const scheduler = new Scheduler({
      taskId,
      goal: 'Order test',
      taskTitle: 'Scheduler Test',
      nodes: [node1, node2],
      agentRegistry: registry,
      toolRegistry: createDefaultToolRegistry(),
      artifactService,
      eventBus,
      taskRepo,
      taskNodeRepo,
      llmProvider: new MockPlannerProvider(),
      fast: true,
    });

    const result = await scheduler.execute();

    expect(result.taskStatus).toBe('done');
    expect(executionOrder).toEqual(['Step 1', 'Step 2']);
  });

  it('dependency failure blocks downstream nodes (Test 3)', async () => {
    const registry = new AgentRegistry();
    registry.register('analyst', {
      role: 'analyst',
      async run(ctx: AgentRunContext): Promise<AgentRunResult> {
        if (ctx.node.title === 'Failing Node') {
          throw new AgentError('Fatal error in upstream node', false);
        }
        return {
          status: 'done',
          outputArtifactIds: [],
          messages: [],
          usage: { inputTokens: 10, outputTokens: 10 },
        };
      },
    });

    const nodeA: TaskNode = {
      id: `${taskId}_fail_a`,
      taskId,
      title: 'Failing Node',
      assignedAgentRole: 'analyst',
      dependsOn: [],
      status: 'pending',
      acceptanceCriteria: [],
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    };
    const nodeB: TaskNode = {
      id: `${taskId}_blocked_b`,
      taskId,
      title: 'Dependent Node',
      assignedAgentRole: 'analyst',
      dependsOn: [nodeA.id],
      status: 'pending',
      acceptanceCriteria: [],
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    };

    await taskNodeRepo.createMany([nodeA, nodeB]);

    const scheduler = new Scheduler({
      taskId,
      goal: 'Failure block test',
      taskTitle: 'Scheduler Test',
      nodes: [nodeA, nodeB],
      agentRegistry: registry,
      toolRegistry: createDefaultToolRegistry(),
      artifactService,
      eventBus,
      taskRepo,
      taskNodeRepo,
      llmProvider: new MockPlannerProvider(),
      fast: true,
    });

    const result = await scheduler.execute();

    expect(result.nodesFailed).toBe(1);
    expect(result.nodesBlocked).toBe(1);
    expect(result.taskStatus).toBe('failed');

    const updatedNodeB = await taskNodeRepo.getById(nodeB.id);
    expect(updatedNodeB?.status).toBe('blocked');
  });

  it('unrelated branches continue after one branch fails (Test 4)', async () => {
    const executed: string[] = [];

    const registry = new AgentRegistry();
    registry.register('researcher', {
      role: 'researcher',
      async run(ctx: AgentRunContext): Promise<AgentRunResult> {
        if (ctx.node.title === 'Branch 1 Fail') {
          throw new AgentError('Branch 1 broke', false);
        }
        executed.push(ctx.node.title);
        return {
          status: 'done',
          outputArtifactIds: [],
          messages: [],
          usage: { inputTokens: 10, outputTokens: 10 },
        };
      },
    });

    // Branch 1: Fail -> Downstream Blocked
    const b1: TaskNode = {
      id: `${taskId}_b1`,
      taskId,
      title: 'Branch 1 Fail',
      assignedAgentRole: 'researcher',
      dependsOn: [],
      status: 'pending',
      acceptanceCriteria: [],
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    };
    const b1Child: TaskNode = {
      id: `${taskId}_b1_child`,
      taskId,
      title: 'Branch 1 Child',
      assignedAgentRole: 'researcher',
      dependsOn: [b1.id],
      status: 'pending',
      acceptanceCriteria: [],
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    };

    // Branch 2: Success -> Success
    const b2: TaskNode = {
      id: `${taskId}_b2`,
      taskId,
      title: 'Branch 2 Parent',
      assignedAgentRole: 'researcher',
      dependsOn: [],
      status: 'pending',
      acceptanceCriteria: [],
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    };
    const b2Child: TaskNode = {
      id: `${taskId}_b2_child`,
      taskId,
      title: 'Branch 2 Child',
      assignedAgentRole: 'researcher',
      dependsOn: [b2.id],
      status: 'pending',
      acceptanceCriteria: [],
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    };

    await taskNodeRepo.createMany([b1, b1Child, b2, b2Child]);

    const scheduler = new Scheduler({
      taskId,
      goal: 'Branch isolation test',
      taskTitle: 'Scheduler Test',
      nodes: [b1, b1Child, b2, b2Child],
      agentRegistry: registry,
      toolRegistry: createDefaultToolRegistry(),
      artifactService,
      eventBus,
      taskRepo,
      taskNodeRepo,
      llmProvider: new MockPlannerProvider(),
      concurrency: 4,
      fast: true,
    });

    const result = await scheduler.execute();

    expect(executed).toContain('Branch 2 Parent');
    expect(executed).toContain('Branch 2 Child');
    expect(executed).not.toContain('Branch 1 Child');
    expect(result.nodesCompleted).toBe(2);
    expect(result.nodesFailed).toBe(1);
    expect(result.nodesBlocked).toBe(1);
  });

  it('respects concurrency limit (Test 15)', async () => {
    let currentlyRunning = 0;
    let peakConcurrency = 0;

    const registry = new AgentRegistry();
    registry.register('analyst', {
      role: 'analyst',
      async run(): Promise<AgentRunResult> {
        currentlyRunning++;
        peakConcurrency = Math.max(peakConcurrency, currentlyRunning);
        await new Promise((r) => setTimeout(r, 40));
        currentlyRunning--;
        return {
          status: 'done',
          outputArtifactIds: [],
          messages: [],
          usage: { inputTokens: 5, outputTokens: 5 },
        };
      },
    });

    // 5 independent nodes
    const nodes: TaskNode[] = Array.from({ length: 5 }, (_, i) => ({
      id: `${taskId}_conc_${i}`,
      taskId,
      title: `Concurrent Node ${i}`,
      assignedAgentRole: 'analyst',
      dependsOn: [],
      status: 'pending',
      acceptanceCriteria: [],
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    }));

    await taskNodeRepo.createMany(nodes);

    // Limit concurrency to 2
    const scheduler = new Scheduler({
      taskId,
      goal: 'Concurrency limit test',
      taskTitle: 'Scheduler Test',
      nodes,
      agentRegistry: registry,
      toolRegistry: createDefaultToolRegistry(),
      artifactService,
      eventBus,
      taskRepo,
      taskNodeRepo,
      llmProvider: new MockPlannerProvider(),
      concurrency: 2, // Must NOT exceed 2!
      fast: true,
    });

    const result = await scheduler.execute();

    expect(result.taskStatus).toBe('done');
    expect(result.nodesCompleted).toBe(5);
    expect(peakConcurrency).toBeLessThanOrEqual(2);
  });

  it('stops cleanly on abort signal (Test 14)', async () => {
    const abortController = new AbortController();

    const registry = new AgentRegistry();
    registry.register('analyst', {
      role: 'analyst',
      async run(ctx: AgentRunContext): Promise<AgentRunResult> {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 200);
          ctx.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new AgentError('Aborted', false));
          });
        });
        return {
          status: 'done',
          outputArtifactIds: [],
          messages: [],
          usage: { inputTokens: 0, outputTokens: 0 },
        };
      },
    });

    const node: TaskNode = {
      id: `${taskId}_abort_node`,
      taskId,
      title: 'Long Running Node',
      assignedAgentRole: 'analyst',
      dependsOn: [],
      status: 'pending',
      acceptanceCriteria: [],
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    };
    await taskNodeRepo.createMany([node]);

    const scheduler = new Scheduler({
      taskId,
      goal: 'Abort test',
      taskTitle: 'Scheduler Test',
      nodes: [node],
      agentRegistry: registry,
      toolRegistry: createDefaultToolRegistry(),
      artifactService,
      eventBus,
      taskRepo,
      taskNodeRepo,
      llmProvider: new MockPlannerProvider(),
      signal: abortController.signal,
      fast: true,
    });

    setTimeout(() => {
      abortController.abort();
    }, 40);

    const result = await scheduler.execute();

    expect(result.taskStatus).toBe('cancelled');
  });
});
