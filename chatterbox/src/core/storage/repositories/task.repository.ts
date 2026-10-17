import { eq, desc } from 'drizzle-orm';
import { AppDatabase } from '../database.js';
import { tasks } from '../schema.js';
import { Task, TaskSchema } from '../../models/task.js';
import { TaskStatus } from '../../models/enums.js';
import { getTimestamp } from '../../../utils/time.js';

export class TaskRepository {
  constructor(private db: AppDatabase) {}

  async create(task: Task): Promise<Task> {
    const validated = TaskSchema.parse(task);
    await this.db.insert(tasks).values({
      id: validated.id,
      title: validated.title,
      goal: validated.goal,
      status: validated.status,
      createdBy: validated.createdBy,
      visibility: validated.visibility,
      createdAt: validated.createdAt,
      updatedAt: validated.updatedAt,
    });
    return validated;
  }

  async getById(id: string): Promise<Task | null> {
    const rows = await this.db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    if (rows.length === 0) return null;
    return TaskSchema.parse(rows[0]);
  }

  async list(limit = 20, offset = 0): Promise<Task[]> {
    const rows = await this.db
      .select()
      .from(tasks)
      .orderBy(desc(tasks.createdAt))
      .limit(limit)
      .offset(offset);
    return rows.map((row) => TaskSchema.parse(row));
  }

  async updateStatus(id: string, status: TaskStatus): Promise<Task | null> {
    const updatedAt = getTimestamp();
    const rows = await this.db
      .update(tasks)
      .set({ status, updatedAt })
      .where(eq(tasks.id, id))
      .returning();
    if (rows.length === 0) return null;
    return TaskSchema.parse(rows[0]);
  }

  async update(id: string, patch: Partial<Omit<Task, 'id' | 'createdAt'>>): Promise<Task | null> {
    const updatedAt = getTimestamp();
    const rows = await this.db
      .update(tasks)
      .set({ ...patch, updatedAt })
      .where(eq(tasks.id, id))
      .returning();
    if (rows.length === 0) return null;
    return TaskSchema.parse(rows[0]);
  }
}
