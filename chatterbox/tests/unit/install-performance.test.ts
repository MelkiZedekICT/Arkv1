import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { generateId } from '../../src/utils/ids.js';
import { createDatabaseConnection } from '../../src/core/storage/database.js';
import { TaskRepository } from '../../src/core/storage/repositories/task.repository.js';
import { EventStore } from '../../src/core/events/event-store.js';
import { Task } from '../../src/core/models/task.js';

describe('Milestone 10: Install Performance & Zero-Dependency Distribution', () => {
  it('1. UUID helper generates unique IDs with built-in crypto.randomUUID() without external uuid package', () => {
    const id1 = generateId('task');
    const id2 = generateId('task');
    expect(id1).toMatch(/^task_[a-f0-9]{32}$/);
    expect(id2).toMatch(/^task_[a-f0-9]{32}$/);
    expect(id1).not.toBe(id2);
  });

  it('2. Zero uuid imports remain in source code', () => {
    const idsFile = readFileSync(join(__dirname, '../../src/utils/ids.ts'), 'utf-8');
    expect(idsFile).not.toContain("from 'uuid'");
    expect(idsFile).not.toContain('from "uuid"');
    expect(idsFile).toContain('randomUUID');
  });

  it('3. Zero better-sqlite3 or node:sqlite imports remain in source storage code', () => {
    const dbFile = readFileSync(join(__dirname, '../../src/core/storage/database.ts'), 'utf-8');
    expect(dbFile).not.toContain('better-sqlite3');
    expect(dbFile).not.toContain('node:sqlite');

    const jsonStorageFile = readFileSync(join(__dirname, '../../src/core/storage/json-storage.ts'), 'utf-8');
    expect(jsonStorageFile).not.toContain('better-sqlite3');
    expect(jsonStorageFile).not.toContain('node:sqlite');
  });

  it('4. JSONL/JSON storage adapter supports atomic persistence and CRUD operations', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'storage-test-'));
    try {
      const db = createDatabaseConnection(tempDir);
      const taskRepo = new TaskRepository(db);

      const task: Task = {
        id: 'test_task_1',
        title: 'Storage Adapter Test',
        goal: 'Verify zero-native JSONL persistence',
        status: 'draft',
        createdBy: 'operator',
        visibility: 'private',
        createdAt: '2026-10-21T12:00:00.000Z',
        updatedAt: '2026-10-21T12:00:00.000Z',
      };

      const created = await taskRepo.create(task);
      expect(created.id).toBe('test_task_1');

      const fetched = await taskRepo.getById('test_task_1');
      expect(fetched?.title).toBe('Storage Adapter Test');

      const updated = await taskRepo.updateStatus('test_task_1', 'running');
      expect(updated?.status).toBe('running');

      const list = await taskRepo.list();
      expect(list).toHaveLength(1);

      // Verify the physical JSONL file exists
      const tasksJsonl = join(tempDir, 'tasks.jsonl');
      expect(existsSync(tasksJsonl)).toBe(true);
      const content = readFileSync(tasksJsonl, 'utf-8');
      expect(content).toContain('"id":"test_task_1"');
      expect(content).toContain('"status":"running"');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('5. Event store remains strictly append-only across multiple event dispatches', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'event-test-'));
    try {
      const eventStore = new EventStore(tempDir);
      const taskId = 'task_event_append_test';

      await eventStore.appendEvent({
        eventId: 'evt_1',
        actorType: 'user',
        actorId: 'user_1',
        correlationId: 'corr_1',
        taskId,
        type: 'task_created',
        timestamp: '2026-10-21T12:00:00.000Z',
        payload: { taskId, goal: 'Goal 1', status: 'draft' },
      });

      await eventStore.appendEvent({
        eventId: 'evt_2',
        actorType: 'agent',
        actorId: 'agent_planner',
        correlationId: 'corr_1',
        taskId,
        type: 'plan_proposed',
        timestamp: '2026-10-21T12:00:01.000Z',
        payload: { taskId, plan: { title: 'P', nodes: [] } },
      });

      const events = await eventStore.getEvents(taskId);
      expect(events).toHaveLength(2);
      expect(events[0].eventId).toBe('evt_1');
      expect(events[1].eventId).toBe('evt_2');

      const replay = await eventStore.replayTask(taskId);
      expect(replay.eventCount).toBe(2);
      expect(replay.status).toBe('planning');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('6. agentfeed --help never creates .chatterbox directory or side effects', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'help-isolation-'));
    const cliEntry = join(__dirname, '../../dist/cli/index.js');
    try {
      const output = execSync(`node "${cliEntry}" --help`, {
        cwd: tempDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      expect(output).toContain('Chatterbox');
      expect(output).toContain('Usage: agentfeed');
      expect(existsSync(join(tempDir, '.chatterbox'))).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('7. Single-file CLI bundle exists with valid Node shebang on line 1', () => {
    const bundlePath = join(__dirname, '../../dist/cli/index.js');
    expect(existsSync(bundlePath)).toBe(true);

    const content = readFileSync(bundlePath, 'utf-8');
    const firstLine = content.split('\n')[0].trim();
    expect(firstLine).toBe('#!/usr/bin/env node');
  });

  it('8. package.json declares zero runtime dependencies', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'));
    expect(pkg.dependencies).toEqual({});
    expect(pkg.bin.agentfeed).toBe('./dist/cli/index.js');
    expect(pkg.files).toEqual(['dist/cli/index.js', 'README.md', 'LICENSE']);
    expect(pkg.engines.node).toBe('>=20');
  });
});
