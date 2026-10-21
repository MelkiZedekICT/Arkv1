import { AppDatabase } from '../database.js';
import { TaskNode, TaskNodeSchema } from '../../models/task-node.js';
import { TaskNodeStatus } from '../../models/enums.js';

export class TaskNodeRepository {
  constructor(private db: AppDatabase) {}

  async createMany(nodes: TaskNode[]): Promise<TaskNode[]> {
    if (nodes.length === 0) return [];
    const validated = nodes.map((n) => TaskNodeSchema.parse(n));
    return this.db.createTaskNodes(validated);
  }

  async listByTaskId(taskId: string): Promise<TaskNode[]> {
    return this.db.listTaskNodesByTaskId(taskId);
  }

  async getById(id: string): Promise<TaskNode | null> {
    return this.db.getTaskNodeById(id);
  }

  async updateStatus(id: string, status: TaskNodeStatus): Promise<TaskNode | null> {
    return this.db.updateTaskNodeStatus(id, status);
  }

  async updateOutputArtifactId(id: string, outputArtifactId: string): Promise<TaskNode | null> {
    return this.db.updateTaskNodeOutputArtifactId(id, outputArtifactId);
  }

  async update(id: string, patch: Partial<Omit<TaskNode, 'id' | 'taskId' | 'createdAt'>>): Promise<TaskNode | null> {
    return this.db.updateTaskNode(id, patch);
  }

  async delete(id: string): Promise<void> {
    return this.db.deleteTaskNode(id);
  }

  async deleteByTaskId(taskId: string): Promise<void> {
    return this.db.deleteTaskNodesByTaskId(taskId);
  }
}
