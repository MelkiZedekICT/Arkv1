import { eq, desc } from 'drizzle-orm';
import { AppDatabase } from '../database.js';
import { artifacts } from '../schema.js';
import { Artifact, ArtifactSchema } from '../../models/artifact.js';

export class ArtifactRepository {
  constructor(private db: AppDatabase) {}

  private mapRowToModel(row: typeof artifacts.$inferSelect): Artifact {
    return ArtifactSchema.parse({
      id: row.id,
      taskId: row.taskId,
      nodeId: row.nodeId ?? undefined,
      authorId: row.authorId,
      type: row.type,
      title: row.title,
      path: row.path,
      createdAt: row.createdAt,
    });
  }

  async create(artifact: Artifact): Promise<Artifact> {
    const validated = ArtifactSchema.parse(artifact);
    await this.db.insert(artifacts).values({
      id: validated.id,
      taskId: validated.taskId,
      nodeId: validated.nodeId ?? null,
      authorId: validated.authorId,
      type: validated.type,
      title: validated.title,
      path: validated.path,
      createdAt: validated.createdAt,
    });
    return validated;
  }

  async listByTaskId(taskId: string): Promise<Artifact[]> {
    const rows = await this.db
      .select()
      .from(artifacts)
      .where(eq(artifacts.taskId, taskId))
      .orderBy(desc(artifacts.createdAt));
    return rows.map((r) => this.mapRowToModel(r));
  }
}
