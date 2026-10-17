import { z } from 'zod';
import { ApprovalStatusSchema, RiskLevelSchema } from './enums.js';

export const ApprovalSchema = z.object({
  id: z.string().min(1, 'Approval ID cannot be empty'),
  taskId: z.string().min(1, 'Task ID cannot be empty'),
  nodeId: z.string().optional(),
  requestedBy: z.string().min(1, 'Requester ID cannot be empty'),
  action: z.string().min(1, 'Action description cannot be empty'),
  riskLevel: RiskLevelSchema,
  status: ApprovalStatusSchema.default('pending'),
  reason: z.string().optional(),
  createdAt: z.string().datetime({ message: 'Must be a valid ISO 8601 timestamp' }),
  decidedAt: z.string().datetime({ message: 'Must be a valid ISO 8601 timestamp' }).optional(),
});

export type Approval = z.infer<typeof ApprovalSchema>;
