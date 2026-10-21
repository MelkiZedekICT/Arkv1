import { AppDatabase } from '../database.js';
import { Artifact, ArtifactSchema } from '../../models/artifact.js';

export class ArtifactRepository {
  constructor(private db: AppDatabase) {}

  async create(artifact: Artifact): Promise<Artifact> {
    const validated = ArtifactSchema.parse(artifact);
    return this.db.createArtifact(validated);
  }

  async listByTaskId(taskId: string): Promise<Artifact[]> {
    return this.db.listArtifactsByTaskId(taskId);
  }

  async getById(id: string): Promise<Artifact | null> {
    return this.db.getArtifactById(id);
  }
}
