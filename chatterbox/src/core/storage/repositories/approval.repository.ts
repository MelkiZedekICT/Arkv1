import { eq, and } from 'drizzle-orm';
import { AppDatabase } from '../database.js';
import { approvals } from '../schema.js';
import { Approval, ApprovalSchema } from '../../models/approval.js';
import { ApprovalStatus } from '../../models/enums.js';
import { getTimestamp } from '../../../utils/time.js';

export class ApprovalRepository {
  constructor(private db: AppDatabase) {}

  private mapRowToModel(row: typeof approvals.$inferSelect): Approval {
    return ApprovalSchema.parse({
      id: row.id,
      taskId: row.taskId,
      nodeId: row.nodeId ?? undefined,
      requestedBy: row.requestedBy,
      action: row.action,
      riskLevel: row.riskLevel,
      status: row.status,
      reason: row.reason ?? undefined,
      createdAt: row.createdAt,
      decidedAt: row.decidedAt ?? undefined,
    });
  }

  async create(approval: Approval): Promise<Approval> {
    const validated = ApprovalSchema.parse(approval);
    await this.db.insert(approvals).values({
      id: validated.id,
      taskId: validated.taskId,
      nodeId: validated.nodeId ?? null,
      requestedBy: validated.requestedBy,
      action: validated.action,
      riskLevel: validated.riskLevel,
      status: validated.status,
      reason: validated.reason ?? null,
      createdAt: validated.createdAt,
      decidedAt: validated.decidedAt ?? null,
    });
    return validated;
  }

  async getPendingByTaskId(taskId: string): Promise<Approval[]> {
    const rows = await this.db
      .select()
      .from(approvals)
      .where(and(eq(approvals.taskId, taskId), eq(approvals.status, 'pending')));
    return rows.map((r) => this.mapRowToModel(r));
  }

  async updateStatus(
    id: string,
    status: ApprovalStatus,
    reason?: string
  ): Promise<Approval | null> {
    const decidedAt = getTimestamp();
    const rows = await this.db
      .update(approvals)
      .set({
        status,
        reason: reason ?? null,
        decidedAt,
      })
      .where(eq(approvals.id, id))
      .returning();
    if (rows.length === 0) return null;
    return this.mapRowToModel(rows[0]);
  }
}
