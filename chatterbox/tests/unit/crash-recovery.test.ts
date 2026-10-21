import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createDatabaseConnection, AppDatabase } from '../../src/core/storage/database.js';
import { TaskRepository } from '../../src/core/storage/repositories/task.repository.js';
import { TaskNodeRepository } from '../../src/core/storage/repositories/task-node.repository.js';
import { ArtifactRepository } from '../../src/core/storage/repositories/artifact.repository.js';
import { EventBus } from '../../src/core/events/event-bus.js';
import { EventStore } from '../../src/core/events/event-store.js';
import { AgentFeedEvent } from '../../src/core/events/event-types.js';
import { CrashRecoveryService } from '../../src/core/security/recovery/crash-recovery.service.js';
import { ArtifactService } from '../../src/core/artifacts/artifact.service.js';
import { Scheduler } from '../../src/core/engine/scheduler.js';
import { AgentRegistry } from '../../src/core/agents/runtime/agent-registry.js';
import { createDefaultToolRegistry } from '../../src/core/tools/index.js';

describe('Crash Recovery & Checkpointing (Milestone 7)', () => {
  let db: AppDatabase;
  let taskRepo: TaskRepository;
  let taskNodeRepo: TaskNodeRepository;
  let artifactRepo: ArtifactRepository;
  let eventBus: EventBus;
  let publishedEvents: AgentFeedEvent[];
  let recoveryService: CrashRecoveryService;
  let tempDir: string;
  const taskId = 'task_recovery_test';
  const now = '2026-10-18T12:00:00.000Z';

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'agentfeed-recovery-'));
    db = createDatabaseConnection(':memory:');
    taskRepo = new TaskRepository(db);
    taskNodeRepo = new TaskNodeRepository(db);
    artifactRepo = new ArtifactRepository(db);
    publishedEvents = [];

    const mockStore = {
      appendEvent: vi.fn().mockImplementation(async (evt: AgentFeedEvent) => {
        publishedEvents.push(evt);
      }),
    } as unknown as EventStore;

    eventBus = new EventBus(mockStore);
    recoveryService = new CrashRecoveryService({
      taskRepo,
      taskNodeRepo,
      artifactRepo,
      eventBus,
    });

    // Create the task in SQLite
    await taskRepo.create({
      id: taskId,
      title: 'Crash Recovery Test Task',
      goal: 'Test recovery and checkpointing',
      status: 'running',
      createdBy: 'test_operator',
      visibility: 'private',
      createdAt: now,
      updatedAt: now,
    });
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('marks interrupted nodes and emits run_interrupted and run_recovered (Requirement 15)', async () => {
    const nodes: TaskNode[] = [
      {
        id: 'node_done_1',
        taskId,
        title: 'Research Stage',
        description: 'Done',
        assignedAgentRole: 'researcher',
        status: 'done',
        dependsOn: [],
        acceptanceCriteria: ['Valid research'],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'node_interrupted_2',
        taskId,
        title: 'Analysis Stage',
        description: 'Crashed mid-flight',
        assignedAgentRole: 'analyst',
        status: 'running',
        dependsOn: ['node_done_1'],
        acceptanceCriteria: ['Valid analysis'],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'node_pending_3',
        taskId,
        title: 'Draft Stage',
        description: 'Pending',
        assignedAgentRole: 'writer',
        status: 'pending',
        dependsOn: ['node_interrupted_2'],
        acceptanceCriteria: ['Valid draft'],
        createdAt: now,
        updatedAt: now,
      },
    ];

    await taskNodeRepo.createMany(nodes);

    // Perform recovery
    const plan = await recoveryService.recoverTask(taskId, 'mock');

    expect(plan.completedNodeIds).toEqual(['node_done_1']);
    expect(plan.interruptedNodeIds).toEqual(['node_interrupted_2']);
    expect(plan.pendingNodeIds).toContain('node_interrupted_2');
    expect(plan.pendingNodeIds).toContain('node_pending_3');

    // Interrupted node is reset to pending so it can safely execute
    const refreshedNode2 = await taskNodeRepo.getById('node_interrupted_2');
    expect(refreshedNode2?.status).toBe('pending');

    // Verify events emitted
    const interruptedEvent = publishedEvents.find((e) => e.type === 'run_interrupted');
    expect(interruptedEvent).toBeDefined();
    expect((interruptedEvent?.payload as any).interruptedNodeIds).toEqual(['node_interrupted_2']);

    const recoveredEvent = publishedEvents.find((e) => e.type === 'run_recovered');
    expect(recoveredEvent).toBeDefined();
    expect((recoveredEvent?.payload as any).recoveredNodeIds).toEqual(['node_interrupted_2']);
    expect((recoveredEvent?.payload as any).skippedCompletedNodeIds).toEqual(['node_done_1']);

    const runStartedEvent = publishedEvents.find((e) => e.type === 'run_started');
    expect(runStartedEvent).toBeDefined();
    expect((runStartedEvent?.payload as any).isResume).toBe(true);

    const checkpointEvent = publishedEvents.find((e) => e.type === 'checkpoint_saved');
    expect(checkpointEvent).toBeDefined();
  });

  it('resume continues without rerunning completed nodes (Requirement 14)', async () => {
    const nodes: TaskNode[] = [
      {
        id: 'node_1_done',
        taskId,
        title: 'Completed Node',
        description: 'Should not rerun',
        assignedAgentRole: 'researcher',
        status: 'done',
        dependsOn: [],
        acceptanceCriteria: ['Done'],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'node_2_pending',
        taskId,
        title: 'Pending Node',
        description: 'Should run',
        assignedAgentRole: 'writer',
        status: 'pending',
        dependsOn: ['node_1_done'],
        acceptanceCriteria: ['Done'],
        createdAt: now,
        updatedAt: now,
      },
    ];

    await taskNodeRepo.createMany(nodes);

    const researcherRunner = vi.fn().mockResolvedValue({
      status: 'done',
      outputArtifactIds: [],
      messages: [],
      usage: { inputTokens: 5, outputTokens: 5 },
    });
    const writerRunner = vi.fn().mockResolvedValue({
      status: 'done',
      outputArtifactIds: [],
      messages: [],
      usage: { inputTokens: 5, outputTokens: 5 },
    });

    const registry = new AgentRegistry();
    registry.register('researcher', { role: 'researcher', run: researcherRunner });
    registry.register('writer', { role: 'writer', run: writerRunner });

    const scheduler = new Scheduler({
      taskId,
      goal: 'Resume test',
      taskTitle: 'Resume Test',
      nodes,
      agentRegistry: registry,
      toolRegistry: createDefaultToolRegistry(),
      artifactService: new ArtifactService(tempDir, artifactRepo, eventBus),
      eventBus,
      taskRepo,
      taskNodeRepo,
    });

    await scheduler.execute();

    // Node 1 was already done: its runner MUST NEVER be invoked!
    expect(researcherRunner).not.toHaveBeenCalled();
    // Node 2 was pending: its runner MUST be invoked!
    expect(writerRunner).toHaveBeenCalledTimes(1);
  });

  it('duplicate artifacts are not created after recovery (Requirement 16)', async () => {
    const artifactService = new ArtifactService(tempDir, artifactRepo, eventBus);

    // Node 1 was already done and produced an artifact
    const art1 = await artifactService.createArtifact({
      taskId,
      nodeId: 'node_done_1',
      authorId: 'agent_researcher',
      type: 'markdown',
      title: 'Market Research Notes',
      filename: 'research-notes.md',
      content: '# Market Research Content',
    });

    expect(art1).toBeDefined();
    const existingList = await artifactRepo.listByTaskId(taskId);
    expect(existingList.length).toBe(1);

    // On recovery, completed node 1 is skipped entirely, so its artifact is preserved and never re-created
    await taskNodeRepo.createMany([
      {
        id: 'node_done_1',
        taskId,
        title: 'Research',
        description: 'Done',
        assignedAgentRole: 'researcher',
        status: 'done',
        dependsOn: [],
        acceptanceCriteria: ['Done'],
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await recoveryService.recoverTask(taskId, 'mock');

    const listAfterRecovery = await artifactRepo.listByTaskId(taskId);
    expect(listAfterRecovery.length).toBe(1);
    expect(listAfterRecovery[0].id).toBe(art1.id);
  });

  it('abort signal safely preserves task state and checkpoints (Requirement 20)', async () => {
    const abortController = new AbortController();
    abortController.abort(); // already aborted

    const registry = new AgentRegistry();
    registry.register('researcher', {
      role: 'researcher',
      run: vi.fn(),
    });

    const scheduler = new Scheduler({
      taskId,
      goal: 'Abort test',
      taskTitle: 'Abort Test',
      nodes: [
        {
          id: 'node_abort_1',
          taskId,
          title: 'To Abort',
          description: 'Will abort',
          assignedAgentRole: 'researcher',
          status: 'pending',
          dependsOn: [],
          acceptanceCriteria: ['Abort'],
          createdAt: now,
          updatedAt: now,
        },
      ],
      agentRegistry: registry,
      toolRegistry: createDefaultToolRegistry(),
      artifactService: new ArtifactService(tempDir, artifactRepo, eventBus),
      eventBus,
      taskRepo,
      taskNodeRepo,
      signal: abortController.signal,
    });

    const result = await scheduler.execute();
    expect(result.taskStatus).toBe('cancelled');

    // Check that task is not deleted and has recorded state
    const task = await taskRepo.getById(taskId);
    expect(task).not.toBeNull();
  });
});
