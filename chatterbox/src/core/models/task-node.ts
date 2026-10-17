import { z } from 'zod';
import { AgentRoleSchema, TaskNodeStatusSchema } from './enums.js';

export const TaskNodeSchema = z.object({
  id: z.string().min(1, 'Task node ID cannot be empty'),
  taskId: z.string().min(1, 'Task ID cannot be empty'),
  title: z.string().min(1, 'Task node title cannot be empty'),
  description: z.string().default(''),
  assignedAgentRole: AgentRoleSchema,
  dependsOn: z.array(z.string()).default([]),
  status: TaskNodeStatusSchema.default('pending'),
  acceptanceCriteria: z.array(z.string()).default([]),
  outputArtifactId: z.string().optional(),
  createdAt: z.string().datetime({ message: 'Must be a valid ISO 8601 timestamp' }),
  updatedAt: z.string().datetime({ message: 'Must be a valid ISO 8601 timestamp' }),
});

export type TaskNode = z.infer<typeof TaskNodeSchema>;
