import { describe, it, expect, vi } from 'vitest';
import { TaskService } from '../../src/core/task/task.service.js';
import { EventBus } from '../../src/core/events/event-bus.js';
import * as dbModule from '../../src/core/storage/database.js';

// Mock the DB and dependencies
vi.mock('../../src/core/storage/database.js', () => {
  const mockInsert = vi.fn().mockReturnValue({
    values: vi.fn().mockResolvedValue(true)
  });
  const mockDb = {
    insert: mockInsert
  };
  return {
    getDatabase: vi.fn(() => mockDb)
  };
});

describe('TaskService', () => {
  it('should create a task, persist to DB and emit event', async () => {
    const mockEmit = vi.fn();
    const mockEventBus = {
      emit: mockEmit
    } as unknown as EventBus;

    const service = new TaskService(mockEventBus, ':memory:');

    const taskId = await service.createTask('Test task creation');
    
    expect(taskId).toBeDefined();
    expect(taskId).toContain('task_');

    // Ensure getDatabase was called
    expect(dbModule.getDatabase).toHaveBeenCalledWith(':memory:');

    // Ensure event bus emit was called
    expect(mockEmit).toHaveBeenCalled();
    const emittedEvent = mockEmit.mock.calls[0][0];
    expect(emittedEvent.type).toBe('task_created');
    expect(emittedEvent.taskId).toBe(taskId);
    expect(emittedEvent.payload.goal).toBe('Test task creation');
  });
});
