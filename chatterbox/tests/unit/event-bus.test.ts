import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../../src/core/events/event-bus.js';
import { EventStore } from '../../src/core/events/event-store.js';
import { AgentFeedEvent } from '../../src/core/events/event-types.js';

describe('EventBus', () => {
  const createMockStore = () =>
    ({
      appendEvent: vi.fn().mockResolvedValue(undefined),
    }) as unknown as EventStore;

  const validEvent: AgentFeedEvent = {
    eventId: 'evt_101',
    taskId: 'task_101',
    type: 'task_created',
    timestamp: '2026-10-17T12:00:00.000Z',
    actorType: 'user',
    actorId: 'local_user',
    correlationId: 'corr_101',
    payload: { goal: 'Test Goal' },
  };

  it('publishes event to subscribers and persists to store', async () => {
    const store = createMockStore();
    const bus = new EventBus(store);

    const specificHandler = vi.fn();
    const wildcardHandler = vi.fn();

    bus.subscribe('task_created', specificHandler);
    bus.subscribe('*', wildcardHandler);

    await bus.publish(validEvent);

    expect(store.appendEvent).toHaveBeenCalledWith(validEvent);
    expect(specificHandler).toHaveBeenCalledWith(validEvent);
    expect(wildcardHandler).toHaveBeenCalledWith(validEvent);
  });

  it('rejects duplicate event IDs', async () => {
    const store = createMockStore();
    const bus = new EventBus(store);

    await bus.publish(validEvent);

    // Second publish with same eventId must throw
    await expect(bus.publish(validEvent)).rejects.toThrow(/Duplicate event ID/);
  });

  it('does not crash publisher when a subscriber throws synchronously or asynchronously', async () => {
    const store = createMockStore();
    const bus = new EventBus(store);

    const faultyHandler = vi.fn().mockImplementation(() => {
      throw new Error('Explosion in subscriber');
    });
    const goodHandler = vi.fn();

    bus.subscribe('task_created', faultyHandler);
    bus.subscribe('task_created', goodHandler);

    const event: AgentFeedEvent = {
      ...validEvent,
      eventId: 'evt_fault_test',
    };

    // publish should resolve smoothly without throwing
    await expect(bus.publish(event)).resolves.toBeDefined();
    expect(faultyHandler).toHaveBeenCalled();
    expect(goodHandler).toHaveBeenCalledWith(event);
  });

  it('supports unbinding / unsubscribing handlers', async () => {
    const store = createMockStore();
    const bus = new EventBus(store);

    const handler = vi.fn();
    const unsubscribe = bus.subscribe('task_created', handler);

    unsubscribe();

    await bus.publish({ ...validEvent, eventId: 'evt_unsub_test' });
    expect(handler).not.toHaveBeenCalled();
  });
});
