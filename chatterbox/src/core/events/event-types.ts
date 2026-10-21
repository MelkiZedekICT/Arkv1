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
  'context_built',
  'llm_call_started',
  'llm_progress',
  'llm_stream_chunk',
  'llm_call_completed',
  'tool_call_started',
  'tool_call_completed',
  'artifact_created',
  'approval_requested',
  'approval_granted',
  'approval_denied',
  'task_paused',
  'task_resumed',
  'task_completed',
  'node_retry_scheduled',
  'node_retry_started',
  'node_retry_exhausted',
  'error_occurred',
  'user_instruction',
  'permission_checked',
  'run_started',
  'run_interrupted',
  'run_recovered',
  'checkpoint_saved',
  'workspace_opened',
  'workspace_mode_set',
  'file_read',
  'file_searched',
  'folder_create_proposed',
  'folder_created',
  'file_create_proposed',
  'file_created',
  'file_edit_proposed',
  'file_edited',
  'file_delete_proposed',
  'file_deleted',
  'diff_proposed',
  'diff_approved',
  'diff_rejected',
  'diff_applied',
  'diff_stale',
  'changeset_proposed',
  'changeset_approved',
  'changeset_rejected',
  'changeset_applied',
  'changeset_failed',
  'changeset_stale',
  'file_backup_created',
  'file_rollback_completed',
  'command_proposed',
  'command_approved',
  'command_rejected',
  'command_started',
  'command_completed',
  'command_failed',
  'tests_started',
  'tests_completed',
  'change_summary_created',
  'quality_gate_passed',
  'quality_gate_failed',
  'explorer_started',
  'explorer_completed',
  'repository_context_built',
  'plan_requested',
  'coder_started',
  'coder_proposed_changes',
  'coder_completed',
  'tester_started',
  'tests_proposed',
  'reviewer_started',
  'review_completed',
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

export const ContextBuiltPayloadSchema = z.object({
  nodeId: z.string(),
  goal: z.string().optional(),
  assignedAgentRole: z.string().optional(),
  inputTokenBudget: z.number().nonnegative(),
  estimatedInputTokens: z.number().nonnegative(),
  includedArtifactIds: z.array(z.string()),
  includedMessageIds: z.array(z.string()),
});
export type ContextBuiltPayload = z.infer<typeof ContextBuiltPayloadSchema>;

export const LlmCallStartedPayloadSchema = z.object({
  nodeId: z.string().optional(),
  model: z.string(),
  provider: z.string(),
  isStreaming: z.boolean().default(false),
  estimatedInputTokens: z.number().nonnegative().optional(),
});
export type LlmCallStartedPayload = z.infer<typeof LlmCallStartedPayloadSchema>;

export const LlmProgressPayloadSchema = z.object({
  nodeId: z.string().optional(),
  activity: z.string().optional(),
  deltaText: z.string().optional(),
  tokensSoFar: z.number().nonnegative().optional(),
});
export type LlmProgressPayload = z.infer<typeof LlmProgressPayloadSchema>;

export const LlmStreamChunkPayloadSchema = z.object({
  nodeId: z.string().optional(),
  text: z.string().optional(),
  finishReason: z.string().optional(),
});
export type LlmStreamChunkPayload = z.infer<typeof LlmStreamChunkPayloadSchema>;

export const LlmCallCompletedPayloadSchema = z.object({
  nodeId: z.string().optional(),
  model: z.string(),
  provider: z.string(),
  latencyMs: z.number().nonnegative(),
  usage: z.object({
    inputTokens: z.number().nonnegative(),
    outputTokens: z.number().nonnegative(),
    estimatedCostUsd: z.number().nonnegative().optional(),
  }),
});
export type LlmCallCompletedPayload = z.infer<typeof LlmCallCompletedPayloadSchema>;

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
  target: z.string().optional(),
  targetPath: z.string().optional(),
  command: z.string().optional(),
  diffSnippet: z.string().optional(),
  reason: z.string().optional(),
});
export type ApprovalRequestedPayload = z.infer<typeof ApprovalRequestedPayloadSchema>;

export const WorkspaceOpenedPayloadSchema = z.object({
  workspaceRoot: z.string(),
  absoluteRoot: z.string(),
  mode: z.enum(['read-only', 'workspace-write', 'supervised']),
  isGitRepo: z.boolean().default(false),
  branch: z.string().optional(),
  headCommit: z.string().optional(),
});
export type WorkspaceOpenedPayload = z.infer<typeof WorkspaceOpenedPayloadSchema>;

export const WorkspaceModeSetPayloadSchema = z.object({
  mode: z.enum(['read-only', 'workspace-write', 'supervised']),
  reason: z.string().optional(),
});
export type WorkspaceModeSetPayload = z.infer<typeof WorkspaceModeSetPayloadSchema>;

export const FileReadPayloadSchema = z.object({
  filePath: z.string(),
  bytes: z.number().nonnegative(),
  isBinary: z.boolean().default(false),
});
export type FileReadPayload = z.infer<typeof FileReadPayloadSchema>;

export const FileSearchedPayloadSchema = z.object({
  query: z.string(),
  matchCount: z.number().nonnegative(),
  matches: z.array(z.string()).default([]),
});
export type FileSearchedPayload = z.infer<typeof FileSearchedPayloadSchema>;

export const DiffProposedPayloadSchema = z.object({
  filePath: z.string(),
  changeType: z.enum(['create', 'edit', 'delete']),
  additions: z.number().nonnegative(),
  deletions: z.number().nonnegative(),
  diffSnippet: z.string(),
});
export type DiffProposedPayload = z.infer<typeof DiffProposedPayloadSchema>;

export const FolderCreateProposedPayloadSchema = z.object({
  folderPath: z.string(),
  reason: z.string().optional(),
});
export type FolderCreateProposedPayload = z.infer<typeof FolderCreateProposedPayloadSchema>;

export const FileCreateProposedPayloadSchema = z.object({
  filePath: z.string(),
  bytes: z.number().nonnegative().optional(),
  diffSnippet: z.string().optional(),
});
export type FileCreateProposedPayload = z.infer<typeof FileCreateProposedPayloadSchema>;

export const FileEditProposedPayloadSchema = z.object({
  filePath: z.string(),
  additions: z.number().nonnegative().optional(),
  deletions: z.number().nonnegative().optional(),
  diffSnippet: z.string().optional(),
});
export type FileEditProposedPayload = z.infer<typeof FileEditProposedPayloadSchema>;

export const FileDeleteProposedPayloadSchema = z.object({
  filePath: z.string(),
  reason: z.string().optional(),
});
export type FileDeleteProposedPayload = z.infer<typeof FileDeleteProposedPayloadSchema>;

export const DiffApprovedPayloadSchema = z.object({
  filePath: z.string(),
  changeType: z.enum(['create', 'edit', 'delete']),
  approvedBy: z.string(),
});
export type DiffApprovedPayload = z.infer<typeof DiffApprovedPayloadSchema>;

export const DiffRejectedPayloadSchema = z.object({
  filePath: z.string(),
  changeType: z.enum(['create', 'edit', 'delete']),
  rejectedBy: z.string(),
  reason: z.string().optional(),
});
export type DiffRejectedPayload = z.infer<typeof DiffRejectedPayloadSchema>;

export const CommandProposedPayloadSchema = z.object({
  command: z.string(),
  cwd: z.string().optional(),
  reason: z.string().optional(),
});
export type CommandProposedPayload = z.infer<typeof CommandProposedPayloadSchema>;

export const CommandApprovedPayloadSchema = z.object({
  command: z.string(),
  approvedBy: z.string(),
});
export type CommandApprovedPayload = z.infer<typeof CommandApprovedPayloadSchema>;

export const DiffAppliedPayloadSchema = z.object({
  filePath: z.string(),
  changeType: z.enum(['create', 'edit', 'delete']),
});
export type DiffAppliedPayload = z.infer<typeof DiffAppliedPayloadSchema>;

export const DiffStalePayloadSchema = z.object({
  changesetId: z.string().optional(),
  filePath: z.string(),
  expectedHash: z.string().optional(),
  actualHash: z.string().nullable().optional(),
  reason: z.string().optional(),
});
export type DiffStalePayload = z.infer<typeof DiffStalePayloadSchema>;

export const ChangesetProposedPayloadSchema = z.object({
  changesetId: z.string(),
  filesCount: z.number().int().nonnegative(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  summary: z.string().optional(),
  riskLevel: z.string().optional(),
  mode: z.string().optional(),
  diffs: z.array(z.record(z.string(), z.unknown())).optional(),
  operations: z.array(z.record(z.string(), z.unknown())).optional(),
});
export type ChangesetProposedPayload = z.infer<typeof ChangesetProposedPayloadSchema>;

export const ChangesetApprovedPayloadSchema = z.object({
  changesetId: z.string(),
  approvedBy: z.string(),
  reason: z.string().optional(),
});
export type ChangesetApprovedPayload = z.infer<typeof ChangesetApprovedPayloadSchema>;

export const ChangesetRejectedPayloadSchema = z.object({
  changesetId: z.string(),
  rejectedBy: z.string(),
  reason: z.string().optional(),
});
export type ChangesetRejectedPayload = z.infer<typeof ChangesetRejectedPayloadSchema>;

export const ChangesetAppliedPayloadSchema = z.object({
  changesetId: z.string(),
  appliedFiles: z.array(z.string()),
  additions: z.number().int().nonnegative().optional(),
  deletions: z.number().int().nonnegative().optional(),
});
export type ChangesetAppliedPayload = z.infer<typeof ChangesetAppliedPayloadSchema>;

export const ChangesetFailedPayloadSchema = z.object({
  changesetId: z.string(),
  error: z.string(),
  rolledBack: z.boolean().default(true),
});
export type ChangesetFailedPayload = z.infer<typeof ChangesetFailedPayloadSchema>;

export const ChangesetStalePayloadSchema = z.object({
  changesetId: z.string(),
  staleFiles: z.array(z.string()),
  reason: z.string().optional(),
});
export type ChangesetStalePayload = z.infer<typeof ChangesetStalePayloadSchema>;

export const FileBackupCreatedPayloadSchema = z.object({
  changesetId: z.string(),
  backupDir: z.string(),
  backedUpFiles: z.array(z.string()),
});
export type FileBackupCreatedPayload = z.infer<typeof FileBackupCreatedPayloadSchema>;

export const FileRollbackCompletedPayloadSchema = z.object({
  changesetId: z.string(),
  restoredFiles: z.array(z.string()),
  error: z.string().optional(),
});
export type FileRollbackCompletedPayload = z.infer<typeof FileRollbackCompletedPayloadSchema>;


export const CommandStartedPayloadSchema = z.object({
  command: z.string(),
  cwd: z.string(),
  nodeId: z.string().optional(),
});
export type CommandStartedPayload = z.infer<typeof CommandStartedPayloadSchema>;

export const CommandCompletedPayloadSchema = z.object({
  command: z.string(),
  exitCode: z.number().nullable(),
  durationMs: z.number().nonnegative(),
  stdoutSnippet: z.string().optional(),
  stderrSnippet: z.string().optional(),
  ok: z.boolean(),
});
export type CommandCompletedPayload = z.infer<typeof CommandCompletedPayloadSchema>;

export const CommandFailedPayloadSchema = z.object({
  command: z.string(),
  error: z.string(),
  durationMs: z.number().nonnegative().optional(),
});
export type CommandFailedPayload = z.infer<typeof CommandFailedPayloadSchema>;

export const TestsStartedPayloadSchema = z.object({
  testCommand: z.string(),
  suiteCount: z.number().optional(),
});
export type TestsStartedPayload = z.infer<typeof TestsStartedPayloadSchema>;

export const TestsCompletedPayloadSchema = z.object({
  testCommand: z.string(),
  passed: z.boolean(),
  passedCount: z.number().optional(),
  failedCount: z.number().optional(),
  summary: z.string().optional(),
});
export type TestsCompletedPayload = z.infer<typeof TestsCompletedPayloadSchema>;

export const ChangeSummaryCreatedPayloadSchema = z.object({
  artifactId: z.string(),
  path: z.string(),
  filesChangedCount: z.number().nonnegative(),
  filesCreatedCount: z.number().nonnegative(),
  testsPassed: z.boolean().optional(),
});
export type ChangeSummaryCreatedPayload = z.infer<typeof ChangeSummaryCreatedPayloadSchema>;

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

export const NodeRetryScheduledPayloadSchema = z.object({
  nodeId: z.string(),
  attempt: z.number().int().positive(),
  maxAttempts: z.number().int().positive(),
  delayMs: z.number().nonnegative(),
  error: z.string(),
});
export type NodeRetryScheduledPayload = z.infer<typeof NodeRetryScheduledPayloadSchema>;

export const NodeRetryStartedPayloadSchema = z.object({
  nodeId: z.string(),
  attempt: z.number().int().positive(),
  maxAttempts: z.number().int().positive(),
});
export type NodeRetryStartedPayload = z.infer<typeof NodeRetryStartedPayloadSchema>;

export const NodeRetryExhaustedPayloadSchema = z.object({
  nodeId: z.string(),
  attempts: z.number().int().positive(),
  error: z.string(),
});
export type NodeRetryExhaustedPayload = z.infer<typeof NodeRetryExhaustedPayloadSchema>;

export const UserInstructionPayloadSchema = z.object({
  agentRole: z.string().optional(),
  instruction: z.string(),
  target: z.string().optional(),
  nodeId: z.string().optional(),
});
export type UserInstructionPayload = z.infer<typeof UserInstructionPayloadSchema>;

export const PermissionCheckedPayloadSchema = z.object({
  agentRole: z.string(),
  permission: z.string(),
  resource: z.string().optional(),
  allowed: z.boolean(),
  requiresApproval: z.boolean(),
  reason: z.string(),
});
export type PermissionCheckedPayload = z.infer<typeof PermissionCheckedPayloadSchema>;

export const RunStartedPayloadSchema = z.object({
  runId: z.string(),
  mode: z.enum(['real', 'mock']),
  isResume: z.boolean().default(false),
});
export type RunStartedPayload = z.infer<typeof RunStartedPayloadSchema>;

export const RunInterruptedPayloadSchema = z.object({
  runId: z.string(),
  reason: z.string(),
  interruptedNodeIds: z.array(z.string()).optional(),
});
export type RunInterruptedPayload = z.infer<typeof RunInterruptedPayloadSchema>;

export const RunRecoveredPayloadSchema = z.object({
  runId: z.string(),
  recoveredNodeIds: z.array(z.string()),
  skippedCompletedNodeIds: z.array(z.string()),
});
export type RunRecoveredPayload = z.infer<typeof RunRecoveredPayloadSchema>;

export const CheckpointSavedPayloadSchema = z.object({
  checkpointId: z.string(),
  completedNodeIds: z.array(z.string()),
  pendingNodeIds: z.array(z.string()),
  budgetUsage: z.record(z.string(), z.unknown()).optional(),
});
export type CheckpointSavedPayload = z.infer<typeof CheckpointSavedPayloadSchema>;

// Generic Event Schema
export const BaseEventSchema = z.object({
  eventId: z.string().min(1, 'Event ID cannot be empty'),
  taskId: z.string().min(1, 'Task ID cannot be empty'),
  nodeId: z.string().optional(),
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
