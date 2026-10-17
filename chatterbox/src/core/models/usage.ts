import { z } from 'zod';

export const UsageRecordSchema = z.object({
  id: z.string().min(1, 'Usage ID cannot be empty'),
  taskId: z.string().min(1, 'Task ID cannot be empty'),
  agentId: z.string().optional(),
  model: z.string().optional(),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  estimatedCost: z.number().nonnegative().default(0),
  toolCalls: z.number().int().nonnegative().default(0),
  createdAt: z.string().datetime({ message: 'Must be a valid ISO 8601 timestamp' }),
});

export type UsageRecord = z.infer<typeof UsageRecordSchema>;
