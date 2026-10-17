import { eq } from 'drizzle-orm';
import { AppDatabase } from '../database.js';
import { taskNodes } from '../schema.js';
import { TaskNode, TaskNodeSchema } from '../../models/task-node.js';
import { TaskNodeStatus } from '../../models/enums.js';
import { getTimestamp } from '../../../utils/time.js';

export class TaskNodeRepository {
  constructor(private db: AppDatabase) {}

  private mapRowToModel(row: typeof taskNodes.$inferSelect): TaskNode {
    return TaskNodeSchema.parse({
      id: row.id,
      taskId: row.taskId,
      title: row.title,
      description: row.description,
      assignedAgentRole: row.assignedAgentRole,
      dependsOn: typeof row.dependsOn === 'string' ? JSON.parse(row.dependsOn) : row.dependsOn,
      status: row.status,
      acceptanceCriteria:
        typeof row.acceptanceCriteria === 'string'
          ? JSON.parse(row.acceptanceCriteria)
          : row.acceptanceCriteria,
      outputArtifactId: row.outputArtifactId ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async createMany(nodes: TaskNode[]): Promise<TaskNode[]> {
    if (nodes.length === 0) return [];
    const validated = nodes.map((n) => TaskNodeSchema.parse(n));

    for (const node of validated) {
      await this.db.insert(taskNodes).values({
        id: node.id,
        taskId: node.taskId,
        title: node.title,
        description: node.description,
        assignedAgentRole: node.assignedAgentRole,
        dependsOn: JSON.stringify(node.dependsOn),
        status: node.status,
        acceptanceCriteria: JSON.stringify(node.acceptanceCriteria),
        outputArtifactId: node.outputArtifactId ?? null,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      });
    }

    return validated;
  }

  async listByTaskId(taskId: string): Promise<TaskNode[]> {
    const rows = await this.db.select().from(taskNodes).where(eq(taskNodes.taskId, taskId));
    return rows.map((r) => this.mapRowToModel(r));
  }

  async getById(id: string): Promise<TaskNode | null> {
    const rows = await this.db.select().from(taskNodes).where(eq(taskNodes.id, id)).limit(1);
    if (rows.length === 0) return null;
    return this.mapRowToModel(rows[0]);
  }

  async updateStatus(id: string, status: TaskNodeStatus): Promise<TaskNode | null> {
    const updatedAt = getTimestamp();
    const rows = await this.db
      .update(taskNodes)
      .set({ status, updatedAt })
      .where(eq(taskNodes.id, id))
      .returning();
    if (rows.length === 0) return null;
    return this.mapRowToModel(rows[0]);
  }
}
