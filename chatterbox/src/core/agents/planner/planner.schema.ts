import { z } from 'zod';

export const AgentSpecialistRoleSchema = z.enum([
  'explorer',
  'planner',
  'researcher',
  'analyst',
  'writer',
  'reviewer',
  'coder',
  'tester',
]);
export type AgentSpecialistRole = z.infer<typeof AgentSpecialistRoleSchema>;

export const EstimatedEffortSchema = z.enum(['low', 'medium', 'high']);
export type EstimatedEffort = z.infer<typeof EstimatedEffortSchema>;

export const ProposedTaskNodeSchema = z.object({
  id: z.string().min(1, 'Task ID cannot be empty'),
  title: z.string().min(1, 'Task title cannot be empty'),
  description: z.string().min(1, 'Task description cannot be empty'),
  assignedAgentRole: AgentSpecialistRoleSchema,
  dependsOn: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string()).min(1, 'At least one acceptance criterion is required'),
  estimatedEffort: EstimatedEffortSchema.default('medium'),
});
export type ProposedTaskNode = z.infer<typeof ProposedTaskNodeSchema>;

export const ProposedPlanSchema = z.object({
  title: z.string().min(1, 'Plan title cannot be empty'),
  summary: z.string().min(1, 'Plan summary cannot be empty'),
  assumptions: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  tasks: z.array(ProposedTaskNodeSchema).min(1, 'Plan must contain at least one task'),
});
export type ProposedPlan = z.infer<typeof ProposedPlanSchema>;
