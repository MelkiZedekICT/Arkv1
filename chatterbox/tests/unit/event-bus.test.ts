import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../../src/core/events/event-bus.js';
import { EventStore } from '../../src/core/events/event-store.js';

describe('EventBus', () => {
  it('should emit events and persist them', () => {
    // Mock the store
    const mockAppend = vi.fn();
    const mockStore = {
      append: mockAppend
    } as unknown as EventStore;

    const bus = new EventBus(mockStore);
    
    // Mock handler
    const mockHandler = vi.fn();
    const mockWildcardHandler = vi.fn();

    bus.on('task_created', mockHandler);
    bus.on('*', mockWildcardHandler);

    const testEvent = {
      type: 'task_created',
      eventId: 'evt_123',
      taskId: 'task_123',
      timestamp: '2026-10-09T00:00:00.000Z',
      actorType: 'user',
      actorId: 'test_user',
      payload: { goal: 'Test Goal' }
    } as const;

    bus.emit(testEvent);

    // Verify append was called
    expect(mockAppend).toHaveBeenCalledWith(testEvent);
    
    // Verify handlers were called
    expect(mockHandler).toHaveBeenCalledWith(testEvent);
    expect(mockWildcardHandler).toHaveBeenCalledWith(testEvent);
  });
});
