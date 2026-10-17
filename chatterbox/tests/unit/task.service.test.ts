import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createDatabaseConnection, AppDatabase } from '../../src/core/storage/database.js';
import { TaskRepository } from '../../src/core/storage/repositories/task.repository.js';
import { EventStore } from '../../src/core/events/event-store.js';
import { EventBus } from '../../src/core/events/event-bus.js';
import { TaskService } from '../../src/core/task/task.service.js';

describe('TaskService Integration', () => {
  let tempDir: string;
  let db: AppDatabase;
  let taskRepo: TaskRepository;
  let eventStore: EventStore;
  let eventBus: EventBus;
  let taskService: TaskService;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'chatterbox-test-task-'));
    db = createDatabaseConnection(':memory:');
    taskRepo = new TaskRepository(db);
    eventStore = new EventStore(tempDir);
    eventBus = new EventBus(eventStore);
    taskService = new TaskService(taskRepo, eventBus);
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('creates task in SQLite, writes task_created event to JSONL, and emits on bus', async () => {
    const subscriber = vi.fn();
    eventBus.subscribe('task_created', subscriber);

    const goal = 'Create competitive brief on security startups';
    const task = await taskService.createTask({
      goal,
      title: 'Security Startups Brief',
      visibility: 'private',
    });

    // 1. Verify returned task
    expect(task.id).toMatch(/^task_/);
    expect(task.title).toBe('Security Startups Brief');
    expect(task.goal).toBe(goal);
    expect(task.status).toBe('draft');

    // 2. Verify persisted in SQLite
    const persisted = await taskRepo.getById(task.id);
    expect(persisted).not.toBeNull();
    expect(persisted?.goal).toBe(goal);

    // 3. Verify event emitted on bus
    expect(subscriber).toHaveBeenCalledTimes(1);
    const emitted = subscriber.mock.calls[0][0];
    expect(emitted.type).toBe('task_created');
    expect(emitted.taskId).toBe(task.id);
    expect(emitted.payload.goal).toBe(goal);

    // 4. Verify persisted to per-task JSONL file
    const events = await eventStore.getEvents(task.id);
    expect(events).toHaveLength(1);
    expect(events[0].eventId).toBe(emitted.eventId);
    expect(events[0].type).toBe('task_created');
  });

  it('rejects empty task goal with an informative error', async () => {
    await expect(taskService.createTask('')).rejects.toThrow(/Task goal cannot be empty/);
    await expect(taskService.createTask({ goal: '   ' })).rejects.toThrow(
      /Task goal cannot be empty/
    );
  });

  it('lists tasks newest first', async () => {
    await taskService.createTask({ goal: 'Goal 1', title: 'Task 1' });
    await taskService.createTask({ goal: 'Goal 2', title: 'Task 2' });

    const list = await taskService.listTasks();
    expect(list).toHaveLength(2);
    // Newest first
    expect(list[0].title).toBe('Task 2');
    expect(list[1].title).toBe('Task 1');
  });
});
