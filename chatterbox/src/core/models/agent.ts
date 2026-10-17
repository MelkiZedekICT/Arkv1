import { z } from 'zod';
import { AgentRoleSchema } from './enums.js';

export const AgentSchema = z.object({
  id: z.string().min(1, 'Agent ID cannot be empty'),
  name: z.string().min(1, 'Agent name cannot be empty'),
  role: AgentRoleSchema,
  description: z.string(),
  systemPrompt: z.string(),
  tools: z.array(z.string()).default([]),
  permissions: z.array(z.string()).default([]),
  model: z.string().min(1, 'Model cannot be empty'),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime({ message: 'Must be a valid ISO 8601 timestamp' }),
  updatedAt: z.string().datetime({ message: 'Must be a valid ISO 8601 timestamp' }),
});

export type Agent = z.infer<typeof AgentSchema>;
