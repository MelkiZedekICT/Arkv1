import { AppDatabase } from '../database.js';
import { UsageRecord, UsageRecordSchema } from '../../models/usage.js';

export class UsageRepository {
  constructor(private db: AppDatabase) {}

  async create(record: UsageRecord): Promise<UsageRecord> {
    const validated = UsageRecordSchema.parse(record);
    return this.db.createUsageRecord(validated);
  }

  async listByTaskId(taskId: string): Promise<UsageRecord[]> {
    return this.db.listUsageByTaskId(taskId);
  }

  async getTotalCostByTaskId(taskId: string): Promise<number> {
    const records = await this.listByTaskId(taskId);
    const sum = records.reduce((acc, curr) => acc + curr.estimatedCost, 0);
    return Math.round(sum * 100_000) / 100_000;
  }
}
