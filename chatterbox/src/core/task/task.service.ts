import { TaskRepository } from '../storage/repositories/task.repository.js';
import { EventBus } from '../events/event-bus.js';
import { Task, TaskSchema } from '../models/task.js';
import { generateId } from '../../utils/ids.js';
import { getTimestamp } from '../../utils/time.js';

export interface CreateTaskOptions {
  goal: string;
  title?: string;
  createdBy?: string;
  visibility?: 'private' | 'public';
}

export class TaskService {
  constructor(
    private taskRepo: TaskRepository,
    private eventBus: EventBus
  ) {}

  async createTask(options: string | CreateTaskOptions): Promise<Task> {
    const opts: CreateTaskOptions =
      typeof options === 'string' ? { goal: options } : options;

    if (!opts.goal || opts.goal.trim().length === 0) {
      throw new Error('Task goal cannot be empty');
    }

    const taskId = generateId('task');
    const timestamp = getTimestamp();
    const title =
      opts.title?.trim() ||
      (opts.goal.length > 50 ? `${opts.goal.slice(0, 47)}...` : opts.goal);
    const createdBy = opts.createdBy || 'user_local';
    const visibility = opts.visibility || 'private';

    const task: Task = TaskSchema.parse({
      id: taskId,
      title,
      goal: opts.goal,
      status: 'draft',
      createdBy,
      visibility,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    // 1. Persist to SQLite via TaskRepository
    const createdTask = await this.taskRepo.create(task);

    // 2. Publish task_created event through EventBus (validates, appends to JSONL, emits to listeners)
    const correlationId = generateId('corr');
    const eventId = generateId('evt');

    await this.eventBus.publish({
      eventId,
      taskId,
      type: 'task_created',
      timestamp,
      actorType: 'user',
      actorId: createdBy,
      correlationId,
      payload: {
        title: createdTask.title,
        goal: createdTask.goal,
        status: createdTask.status,
        visibility: createdTask.visibility,
        createdBy: createdTask.createdBy,
      },
    });

    return createdTask;
  }

  async getTask(id: string): Promise<Task | null> {
    return this.taskRepo.getById(id);
  }

  async listTasks(limit = 20, offset = 0): Promise<Task[]> {
    return this.taskRepo.list(limit, offset);
  }
}
