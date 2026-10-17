import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { EventStore } from '../../src/core/events/event-store.js';
import { AgentFeedEvent } from '../../src/core/events/event-types.js';

describe('EventStore', () => {
  let tempDir: string;
  let eventStore: EventStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'chatterbox-test-store-'));
    eventStore = new EventStore(tempDir);
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const baseEvent = (type: AgentFeedEvent['type'], id: string, timestamp: string): AgentFeedEvent => ({
    eventId: id,
    taskId: 'task_xyz',
    type,
    timestamp,
    actorType: 'user',
    actorId: 'test_user',
    correlationId: 'corr_xyz',
    payload: {},
  });

  it('appends and reads events in insertion order', async () => {
    const e1 = baseEvent('task_created', 'evt_1', '2026-10-17T10:00:00.000Z');
    const e2 = baseEvent('plan_proposed', 'evt_2', '2026-10-17T10:01:00.000Z');
    const e3 = baseEvent('plan_approved', 'evt_3', '2026-10-17T10:02:00.000Z');

    await eventStore.appendEvent(e1);
    await eventStore.appendEvent(e2);
    await eventStore.appendEvent(e3);

    const loaded = await eventStore.getEvents('task_xyz');
    expect(loaded).toHaveLength(3);
    expect(loaded[0].eventId).toBe('evt_1');
    expect(loaded[1].eventId).toBe('evt_2');
    expect(loaded[2].eventId).toBe('evt_3');
  });

  it('replayTask derives correct status and statistics', async () => {
    const e1 = baseEvent('task_created', 'evt_1', '2026-10-17T10:00:00.000Z');
    const e2 = baseEvent('plan_proposed', 'evt_2', '2026-10-17T10:01:00.000Z');
    const e3 = baseEvent('plan_approved', 'evt_3', '2026-10-17T10:02:00.000Z');
    const e4 = baseEvent('task_paused', 'evt_4', '2026-10-17T10:03:00.000Z');

    await eventStore.appendEvent(e1);
    await eventStore.appendEvent(e2);
    await eventStore.appendEvent(e3);
    await eventStore.appendEvent(e4);

    const result = await eventStore.replayTask('task_xyz');
    expect(result.taskId).toBe('task_xyz');
    expect(result.eventCount).toBe(4);
    expect(result.status).toBe('paused');
    expect(result.firstEventTimestamp).toBe('2026-10-17T10:00:00.000Z');
    expect(result.lastEventTimestamp).toBe('2026-10-17T10:03:00.000Z');
    expect(result.events).toHaveLength(4);
  });

  it('replayTask handles non-existent tasks gracefully', async () => {
    const result = await eventStore.replayTask('non_existent');
    expect(result.eventCount).toBe(0);
    expect(result.status).toBe('draft');
    expect(result.firstEventTimestamp).toBeNull();
    expect(result.lastEventTimestamp).toBeNull();
  });
});
