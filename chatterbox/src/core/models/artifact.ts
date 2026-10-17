import { z } from 'zod';
import { ArtifactTypeSchema } from './enums.js';

export const ArtifactSchema = z.object({
  id: z.string().min(1, 'Artifact ID cannot be empty'),
  taskId: z.string().min(1, 'Task ID cannot be empty'),
  nodeId: z.string().optional(),
  authorId: z.string().min(1, 'Author ID cannot be empty'),
  type: ArtifactTypeSchema,
  title: z.string().min(1, 'Artifact title cannot be empty'),
  path: z.string().min(1, 'Artifact path cannot be empty'),
  createdAt: z.string().datetime({ message: 'Must be a valid ISO 8601 timestamp' }),
});

export type Artifact = z.infer<typeof ArtifactSchema>;
