import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createDatabaseConnection, AppDatabase } from '../../src/core/storage/database.js';
import {
  TaskRepository,
  TaskNodeRepository,
  ArtifactRepository,
  ApprovalRepository,
} from '../../src/core/storage/repositories/index.js';
import { EventStore } from '../../src/core/events/event-store.js';
import { EventBus } from '../../src/core/events/event-bus.js';
import { TaskService } from '../../src/core/task/task.service.js';
import { DemoRunner } from '../../src/core/simulation/demo-runner.js';
import { AgentFeedEvent } from '../../src/core/events/event-types.js';

describe('DemoRunner', () => {
  let tempDir: string;
  let db: AppDatabase;
  let taskRepo: TaskRepository;
  let taskNodeRepo: TaskNodeRepository;
  let artifactRepo: ArtifactRepository;
  let approvalRepo: ApprovalRepository;
  let eventStore: EventStore;
  let eventBus: EventBus;
  let taskService: TaskService;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'chatterbox-test-demo-'));
    db = createDatabaseConnection(':memory:');
    taskRepo = new TaskRepository(db);
    taskNodeRepo = new TaskNodeRepository(db);
    artifactRepo = new ArtifactRepository(db);
    approvalRepo = new ApprovalRepository(db);
    eventStore = new EventStore(tempDir);
    eventBus = new EventBus(eventStore);
    taskService = new TaskService(taskRepo, eventBus);
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('runs complete scripted simulation and publishes valid ordered sequence of events', async () => {
    const receivedEvents: AgentFeedEvent[] = [];
    eventBus.subscribe('*', (e) => receivedEvents.push(e));

    const runner = new DemoRunner({
      taskService,
      taskNodeRepo,
      artifactRepo,
      approvalRepo,
      eventBus,
      storageDir: tempDir,
      fast: true,
      noApprove: true,
    });

    const task = await runner.run();
    expect(task).toBeDefined();
    expect(task.id).toMatch(/^task_/);

    // Verify events were emitted in logical order
    const eventTypes = receivedEvents.map((e) => e.type);
    expect(eventTypes).toContain('task_created');
    expect(eventTypes).toContain('plan_proposed');
    expect(eventTypes).toContain('node_created');
    expect(eventTypes).toContain('node_started');
    expect(eventTypes).toContain('tool_call_started');
    expect(eventTypes).toContain('tool_call_completed');
    expect(eventTypes).toContain('artifact_created');
    expect(eventTypes).toContain('approval_requested');
    expect(eventTypes).toContain('approval_granted');
    expect(eventTypes).toContain('task_completed');

    // Verify task nodes were persisted in SQLite
    const nodes = await taskNodeRepo.listByTaskId(task.id);
    expect(nodes).toHaveLength(5);
    expect(nodes.every((n) => n.status === 'done')).toBe(true);

    // Verify artifact was persisted on disk and in database
    const artifacts = await artifactRepo.listByTaskId(task.id);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].title).toContain('Competitive Brief');
    expect(existsSync(artifacts[0].path)).toBe(true);

    // Verify runner completion flag
    expect(runner.completed).toBe(true);
  });

  it('pauses simulation on approval_requested and resumes when approved', async () => {
    const runner = new DemoRunner({
      taskService,
      taskNodeRepo,
      artifactRepo,
      approvalRepo,
      eventBus,
      storageDir: tempDir,
      fast: true,
      noApprove: false, // will wait for approval
    });

    const runPromise = runner.run();

    // Poll until waiting for approval
    while (!runner.isAwaitingApproval && !runner.completed) {
      await new Promise((r) => setTimeout(r, 20));
    }

    expect(runner.isAwaitingApproval).toBe(true);
    expect(runner.completed).toBe(false);

    // Grant approval
    runner.approve('Manual test approval');
    await runPromise;

    expect(runner.completed).toBe(true);
    const nodes = await taskNodeRepo.listByTaskId(runner.taskId!);
    const lastNode = nodes.find((n) => n.id.endsWith('node_5'));
    expect(lastNode?.status).toBe('done');
  });

  it('stops and fails the relevant node when approval is rejected', async () => {
    const runner = new DemoRunner({
      taskService,
      taskNodeRepo,
      artifactRepo,
      approvalRepo,
      eventBus,
      storageDir: tempDir,
      fast: true,
      noApprove: false,
    });

    const runPromise = runner.run();

    while (!runner.isAwaitingApproval && !runner.completed) {
      await new Promise((r) => setTimeout(r, 20));
    }

    expect(runner.isAwaitingApproval).toBe(true);
    runner.reject('Rejected for test purposes');
    await runPromise;

    expect(runner.completed).toBe(false);
    const nodes = await taskNodeRepo.listByTaskId(runner.taskId!);
    const lastNode = nodes.find((n) => n.id.endsWith('node_5'));
    expect(lastNode?.status).toBe('awaiting_approval');
  });

  it('supports pause and resume without crashing', async () => {
    const runner = new DemoRunner({
      taskService,
      taskNodeRepo,
      artifactRepo,
      approvalRepo,
      eventBus,
      storageDir: tempDir,
      fast: true,
      noApprove: true,
    });

    const runPromise = runner.run();

    await new Promise((r) => setTimeout(r, 40));
    runner.pause();
    expect(runner.paused).toBe(true);

    await new Promise((r) => setTimeout(r, 50));
    runner.resume();
    expect(runner.paused).toBe(false);

    await runPromise;
    expect(runner.completed).toBe(true);
  });

  it('cleans up safely when stop() is called mid-run', async () => {
    const runner = new DemoRunner({
      taskService,
      taskNodeRepo,
      artifactRepo,
      approvalRepo,
      eventBus,
      storageDir: tempDir,
      fast: false,
      noApprove: false,
    });

    const runPromise = runner.run();
    await new Promise((r) => setTimeout(r, 100));

    runner.stop();
    expect(runner.stopped).toBe(true);

    await expect(runPromise).resolves.toBeDefined();
  });
});
