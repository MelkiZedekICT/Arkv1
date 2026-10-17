import { z } from 'zod';
import { ActorTypeSchema } from '../models/enums.js';

export const AgentFeedEventTypeSchema = z.enum([
  'task_created',
  'task_updated',
  'planner_started',
  'planner_message',
  'planner_response_received',
  'plan_proposed',
  'plan_validation_failed',
  'plan_approved',
  'plan_rejected',
  'plan_revision_requested',
  'node_created',
  'node_started',
  'node_completed',
  'node_failed',
  'agent_message',
  'agent_reply',
  'tool_call_started',
  'tool_call_completed',
  'artifact_created',
  'approval_requested',
  'approval_granted',
  'approval_denied',
  'task_paused',
  'task_resumed',
  'task_completed',
  'error_occurred',
]);
export type AgentFeedEventType = z.infer<typeof AgentFeedEventTypeSchema>;

export const ChatterboxEventTypeSchema = AgentFeedEventTypeSchema;
export type ChatterboxEventType = AgentFeedEventType;

// Specific typed payloads
export const TaskCreatedPayloadSchema = z.object({
  title: z.string().optional(),
  goal: z.string(),
  status: z.string().optional(),
  visibility: z.enum(['private', 'public']).optional(),
  createdBy: z.string().optional(),
});
export type TaskCreatedPayload = z.infer<typeof TaskCreatedPayloadSchema>;

export const TaskUpdatedPayloadSchema = z.object({
  status: z.string().optional(),
  patch: z.record(z.string(), z.unknown()).optional(),
});
export type TaskUpdatedPayload = z.infer<typeof TaskUpdatedPayloadSchema>;

export const PlannerStartedPayloadSchema = z.object({
  model: z.string().optional(),
  provider: z.string().optional(),
  promptTokens: z.number().optional(),
});
export type PlannerStartedPayload = z.infer<typeof PlannerStartedPayloadSchema>;

export const PlannerMessagePayloadSchema = z.object({
  content: z.string(),
  phase: z.enum(['understanding', 'designing', 'validating', 'repairing']).optional(),
});
export type PlannerMessagePayload = z.infer<typeof PlannerMessagePayloadSchema>;

export const PlannerResponseReceivedPayloadSchema = z.object({
  rawResponseLength: z.number().optional(),
  latencyMs: z.number().optional(),
  usage: z
    .object({
      inputTokens: z.number(),
      outputTokens: z.number(),
      estimatedCostUsd: z.number().optional(),
    })
    .optional(),
});
export type PlannerResponseReceivedPayload = z.infer<typeof PlannerResponseReceivedPayloadSchema>;

export const PlanProposedPayloadSchema = z.object({
  title: z.string().optional(),
  summary: z.string().optional(),
  assumptions: z.array(z.string()).optional(),
  risks: z.array(z.string()).optional(),
  nodes: z.array(z.record(z.string(), z.unknown())),
});
export type PlanProposedPayload = z.infer<typeof PlanProposedPayloadSchema>;

export const PlanValidationFailedPayloadSchema = z.object({
  errors: z.array(z.string()),
  attempt: z.number(),
  maxAttempts: z.number(),
});
export type PlanValidationFailedPayload = z.infer<typeof PlanValidationFailedPayloadSchema>;

export const PlanApprovedPayloadSchema = z.object({
  approvedBy: z.string(),
  reason: z.string().optional(),
});
export type PlanApprovedPayload = z.infer<typeof PlanApprovedPayloadSchema>;

export const PlanRejectedPayloadSchema = z.object({
  rejectedBy: z.string(),
  reason: z.string(),
});
export type PlanRejectedPayload = z.infer<typeof PlanRejectedPayloadSchema>;

export const PlanRevisionRequestedPayloadSchema = z.object({
  requestedBy: z.string(),
  feedback: z.string(),
});
export type PlanRevisionRequestedPayload = z.infer<typeof PlanRevisionRequestedPayloadSchema>;

export const NodeCreatedPayloadSchema = z.object({
  nodeId: z.string(),
  title: z.string(),
  assignedAgentRole: z.string(),
  dependsOn: z.array(z.string()).default([]),
});
export type NodeCreatedPayload = z.infer<typeof NodeCreatedPayloadSchema>;

export const NodeStartedPayloadSchema = z.object({
  nodeId: z.string(),
});
export type NodeStartedPayload = z.infer<typeof NodeStartedPayloadSchema>;

export const NodeCompletedPayloadSchema = z.object({
  nodeId: z.string(),
  outputArtifactId: z.string().optional(),
  summary: z.string().optional(),
});
export type NodeCompletedPayload = z.infer<typeof NodeCompletedPayloadSchema>;

export const NodeFailedPayloadSchema = z.object({
  nodeId: z.string(),
  error: z.string(),
});
export type NodeFailedPayload = z.infer<typeof NodeFailedPayloadSchema>;

export const AgentMessagePayloadSchema = z.object({
  content: z.string(),
  nodeId: z.string().optional(),
  kind: z.string().optional(),
});
export type AgentMessagePayload = z.infer<typeof AgentMessagePayloadSchema>;

export const AgentReplyPayloadSchema = z.object({
  content: z.string(),
  replyToMessageId: z.string(),
  nodeId: z.string().optional(),
});
export type AgentReplyPayload = z.infer<typeof AgentReplyPayloadSchema>;

export const ToolCallStartedPayloadSchema = z.object({
  toolName: z.string(),
  toolCallId: z.string(),
  input: z.record(z.string(), z.unknown()),
  nodeId: z.string().optional(),
});
export type ToolCallStartedPayload = z.infer<typeof ToolCallStartedPayloadSchema>;

export const ToolCallCompletedPayloadSchema = z.object({
  toolName: z.string(),
  toolCallId: z.string(),
  output: z.unknown(),
  durationMs: z.number().nonnegative().optional(),
  nodeId: z.string().optional(),
});
export type ToolCallCompletedPayload = z.infer<typeof ToolCallCompletedPayloadSchema>;

export const ArtifactCreatedPayloadSchema = z.object({
  artifactId: z.string(),
  title: z.string(),
  type: z.string(),
  path: z.string(),
  nodeId: z.string().optional(),
});
export type ArtifactCreatedPayload = z.infer<typeof ArtifactCreatedPayloadSchema>;

export const ApprovalRequestedPayloadSchema = z.object({
  approvalId: z.string(),
  action: z.string(),
  riskLevel: z.enum(['low', 'medium', 'high']),
  nodeId: z.string().optional(),
});
export type ApprovalRequestedPayload = z.infer<typeof ApprovalRequestedPayloadSchema>;

export const ApprovalGrantedPayloadSchema = z.object({
  approvalId: z.string(),
  decidedBy: z.string(),
  reason: z.string().optional(),
});
export type ApprovalGrantedPayload = z.infer<typeof ApprovalGrantedPayloadSchema>;

export const ApprovalDeniedPayloadSchema = z.object({
  approvalId: z.string(),
  decidedBy: z.string(),
  reason: z.string().optional(),
});
export type ApprovalDeniedPayload = z.infer<typeof ApprovalDeniedPayloadSchema>;

export const TaskPausedPayloadSchema = z.object({
  reason: z.string().optional(),
});
export type TaskPausedPayload = z.infer<typeof TaskPausedPayloadSchema>;

export const TaskResumedPayloadSchema = z.object({
  reason: z.string().optional(),
});
export type TaskResumedPayload = z.infer<typeof TaskResumedPayloadSchema>;

export const TaskCompletedPayloadSchema = z.object({
  summary: z.string().optional(),
  deliverableArtifactId: z.string().optional(),
});
export type TaskCompletedPayload = z.infer<typeof TaskCompletedPayloadSchema>;

export const ErrorOccurredPayloadSchema = z.object({
  error: z.string(),
  nodeId: z.string().optional(),
  fatal: z.boolean().default(false),
});
export type ErrorOccurredPayload = z.infer<typeof ErrorOccurredPayloadSchema>;

// Generic Event Schema
export const BaseEventSchema = z.object({
  eventId: z.string().min(1, 'Event ID cannot be empty'),
  taskId: z.string().min(1, 'Task ID cannot be empty'),
  timestamp: z.string().datetime({ message: 'Must be a valid ISO 8601 timestamp' }),
  actorType: ActorTypeSchema,
  actorId: z.string().min(1, 'Actor ID cannot be empty'),
  correlationId: z.string().min(1, 'Correlation ID cannot be empty'),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const AgentFeedEventSchema = BaseEventSchema.extend({
  type: AgentFeedEventTypeSchema,
  payload: z.record(z.string(), z.unknown()),
});

export type AgentFeedEvent<TPayload = Record<string, unknown>> = z.infer<typeof BaseEventSchema> & {
  type: AgentFeedEventType;
  payload: TPayload;
};

// Chatterbox aliases
export const ChatterboxEventSchema = AgentFeedEventSchema;
export type ChatterboxEvent<TPayload = Record<string, unknown>> = AgentFeedEvent<TPayload>;
