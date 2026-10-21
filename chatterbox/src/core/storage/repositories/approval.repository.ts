import { AppDatabase } from '../database.js';
import { Approval, ApprovalSchema } from '../../models/approval.js';
import { ApprovalStatus } from '../../models/enums.js';

export class ApprovalRepository {
  constructor(private db: AppDatabase) {}

  async create(approval: Approval): Promise<Approval> {
    const validated = ApprovalSchema.parse(approval);
    return this.db.createApproval(validated);
  }

  async getPendingByTaskId(taskId: string): Promise<Approval[]> {
    return this.db.getPendingApprovalsByTaskId(taskId);
  }

  async listByTaskId(taskId: string): Promise<Approval[]> {
    return this.db.listApprovalsByTaskId(taskId);
  }

  async getById(id: string): Promise<Approval | null> {
    return this.db.getApprovalById(id);
  }

  async updateStatus(id: string, status: ApprovalStatus, reason?: string): Promise<Approval | null> {
    return this.db.updateApprovalStatus(id, status, reason);
  }
}
