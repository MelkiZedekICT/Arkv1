import { AppDatabase } from '../database.js';
import { Task, TaskSchema } from '../../models/task.js';
import { TaskStatus } from '../../models/enums.js';

export class TaskRepository {
  constructor(private db: AppDatabase) {}

  async create(task: Task): Promise<Task> {
    const validated = TaskSchema.parse(task);
    return this.db.createTask(validated);
  }

  async getById(id: string): Promise<Task | null> {
    return this.db.getTaskById(id);
  }

  async list(limit = 20, offset = 0): Promise<Task[]> {
    return this.db.listTasks(limit, offset);
  }

  async updateStatus(id: string, status: TaskStatus): Promise<Task | null> {
    return this.db.updateTaskStatus(id, status);
  }

  async update(id: string, patch: Partial<Omit<Task, 'id' | 'createdAt'>>): Promise<Task | null> {
    return this.db.updateTask(id, patch);
  }
}
