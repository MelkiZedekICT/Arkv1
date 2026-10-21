import { AppDatabase } from '../database.js';
import {
  ProposedChangeset,
  ProposedChangesetSchema,
  ChangesetStatus,
} from '../../agents/schemas/coding-schemas.js';
import { getTimestamp } from '../../../utils/time.js';

export class ChangesetRepository {
  constructor(private db: AppDatabase) {}

  async create(changeset: ProposedChangeset): Promise<ProposedChangeset> {
    const validated = ProposedChangesetSchema.parse(changeset);
    return this.db.createChangeset(validated);
  }

  async getById(id: string): Promise<ProposedChangeset | null> {
    return this.db.getChangesetById(id);
  }

  async getByNodeId(nodeId: string): Promise<ProposedChangeset | null> {
    return this.db.getChangesetByNodeId(nodeId);
  }

  async listByTaskId(taskId: string): Promise<ProposedChangeset[]> {
    return this.db.listChangesetsByTaskId(taskId);
  }

  async update(changeset: ProposedChangeset): Promise<ProposedChangeset> {
    const validated = ProposedChangesetSchema.parse({
      ...changeset,
      updatedAt: getTimestamp(),
    });
    return this.db.updateChangeset(validated);
  }

  async updateStatus(
    id: string,
    status: ChangesetStatus,
    patch?: Partial<ProposedChangeset>
  ): Promise<ProposedChangeset | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const merged: ProposedChangeset = {
      ...existing,
      ...patch,
      status,
      updatedAt: getTimestamp(),
    };

    return this.update(merged);
  }
}
