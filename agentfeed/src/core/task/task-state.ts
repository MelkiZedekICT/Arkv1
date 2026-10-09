import { z } from 'zod';

export const AgentRoleSchema = z.enum([
  'planner',
  'researcher',
  'analyst',
  'writer',
  'reviewer'
]);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

export const TaskNodeStatusSchema = z.enum([
  'pending',
  'awaiting_approval',
  'running',
  'blocked',
  'done',
  'failed'
]);
export type TaskNodeStatus = z.infer<typeof TaskNodeStatusSchema>;

export const TaskNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  assignedAgent: AgentRoleSchema,
  dependsOn: z.array(z.string()),
  status: TaskNodeStatusSchema,
  outputArtifactId: z.string().optional(),
  acceptanceCriteria: z.array(z.string())
});
export type TaskNode = z.infer<typeof TaskNodeSchema>;

export const TaskStatusSchema = z.enum([
  'pending',
  'running',
  'paused',
  'failed',
  'completed'
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskSchema = z.object({
  id: z.string(),
  goal: z.string(),
  status: TaskStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string()
});
export type Task = z.infer<typeof TaskSchema>;
