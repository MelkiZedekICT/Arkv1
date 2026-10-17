import { eq, desc } from 'drizzle-orm';
import { AppDatabase } from '../database.js';
import { usageRecords } from '../schema.js';
import { UsageRecord, UsageRecordSchema } from '../../models/usage.js';

export class UsageRepository {
  constructor(private db: AppDatabase) {}

  async create(record: UsageRecord): Promise<UsageRecord> {
    const validated = UsageRecordSchema.parse(record);
    await this.db.insert(usageRecords).values({
      id: validated.id,
      taskId: validated.taskId,
      agentId: validated.agentId || null,
      model: validated.model || null,
      inputTokens: validated.inputTokens,
      outputTokens: validated.outputTokens,
      estimatedCost: validated.estimatedCost,
      toolCalls: validated.toolCalls,
      createdAt: validated.createdAt,
    });
    return validated;
  }

  async listByTaskId(taskId: string): Promise<UsageRecord[]> {
    const rows = await this.db
      .select()
      .from(usageRecords)
      .where(eq(usageRecords.taskId, taskId))
      .orderBy(desc(usageRecords.createdAt));

    return rows.map((r) =>
      UsageRecordSchema.parse({
        id: r.id,
        taskId: r.taskId,
        agentId: r.agentId ?? undefined,
        model: r.model ?? undefined,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        estimatedCost: r.estimatedCost,
        toolCalls: r.toolCalls,
        createdAt: r.createdAt,
      })
    );
  }

  async getTotalCostByTaskId(taskId: string): Promise<number> {
    const records = await this.listByTaskId(taskId);
    const sum = records.reduce((acc, curr) => acc + curr.estimatedCost, 0);
    return Math.round(sum * 100_000) / 100_000;
  }
}
