import { z } from 'zod';

export const TaskStatusSchema = z.enum([
  'draft',
  'planning',
  'awaiting_approval',
  'ready',
  'running',
  'paused',
  'blocked',
  'review',
  'done',
  'failed',
  'cancelled',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskNodeStatusSchema = z.enum([
  'pending',
  'awaiting_approval',
  'running',
  'blocked',
  'done',
  'failed',
]);
export type TaskNodeStatus = z.infer<typeof TaskNodeStatusSchema>;

export const AgentRoleSchema = z.enum([
  'planner',
  'researcher',
  'analyst',
  'writer',
  'reviewer',
]);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

export const ActorTypeSchema = z.enum(['user', 'agent', 'system']);
export type ActorType = z.infer<typeof ActorTypeSchema>;

export const MessageKindSchema = z.enum([
  'thought',
  'proposal',
  'question',
  'result',
  'handoff',
  'tool_call',
  'approval',
  'error',
  'user_instruction',
]);
export type MessageKind = z.infer<typeof MessageKindSchema>;

export const ArtifactTypeSchema = z.enum(['markdown', 'json', 'text', 'link']);
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;

export const RiskLevelSchema = z.enum(['low', 'medium', 'high']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const ApprovalStatusSchema = z.enum(['pending', 'approved', 'rejected']);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const TaskVisibilitySchema = z.enum(['private', 'public']);
export type TaskVisibility = z.infer<typeof TaskVisibilitySchema>;
