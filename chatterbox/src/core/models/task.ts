import { z } from 'zod';
import { TaskStatusSchema, TaskVisibilitySchema } from './enums.js';

export const TaskSchema = z.object({
  id: z.string().min(1, 'Task ID cannot be empty'),
  title: z.string().min(1, 'Task title cannot be empty'),
  goal: z.string().min(1, 'Task goal cannot be empty'),
  status: TaskStatusSchema.default('draft'),
  createdBy: z.string().min(1, 'Creator ID cannot be empty'),
  createdAt: z.string().datetime({ message: 'Must be a valid ISO 8601 timestamp' }),
  updatedAt: z.string().datetime({ message: 'Must be a valid ISO 8601 timestamp' }),
  visibility: TaskVisibilitySchema.default('private'),
  workspace: z.string().nullish().transform((v) => v ?? undefined),
  metadata: z.record(z.string(), z.unknown()).nullish().transform((v) => v ?? undefined),
});

export type Task = z.infer<typeof TaskSchema>;
