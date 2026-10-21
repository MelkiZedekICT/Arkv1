import { z } from 'zod';
import { AgentRoleSchema } from '../../models/enums.js';


export const RepositoryBriefSchema = z.object({
  summary: z.string().min(1, 'Summary cannot be empty'),
  languages: z.array(z.string()).default([]),
  relevantFiles: z.array(z.string()).default([]),
  existingPatterns: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
});
export type RepositoryBrief = z.infer<typeof RepositoryBriefSchema>;

export const ProposedCreateFileOpSchema = z.object({
  operation: z.literal('create_file'),
  path: z.string().min(1, 'Path cannot be empty'),
  content: z.string(),
  reason: z.string().min(1, 'Reason cannot be empty'),
});
export type ProposedCreateFileOp = z.infer<typeof ProposedCreateFileOpSchema>;

export const ProposedEditFileOpSchema = z.object({
  operation: z.literal('edit_file'),
  path: z.string().min(1, 'Path cannot be empty'),
  search: z.string().optional(),
  replace: z.string().optional(),
  newContent: z.string().optional(),
  reason: z.string().min(1, 'Reason cannot be empty'),
});
export type ProposedEditFileOp = z.infer<typeof ProposedEditFileOpSchema>;

export const ProposedCreateFolderOpSchema = z.object({
  operation: z.literal('create_folder'),
  path: z.string().min(1, 'Path cannot be empty'),
  reason: z.string().min(1, 'Reason cannot be empty'),
});
export type ProposedCreateFolderOp = z.infer<typeof ProposedCreateFolderOpSchema>;

export const ProposedDeleteFileOpSchema = z.object({
  operation: z.literal('delete_file'),
  path: z.string().min(1, 'Path cannot be empty'),
  reason: z.string().min(1, 'Reason cannot be empty'),
});
export type ProposedDeleteFileOp = z.infer<typeof ProposedDeleteFileOpSchema>;

export const ProposedFileOperationSchema = z.discriminatedUnion('operation', [
  ProposedCreateFileOpSchema,
  ProposedEditFileOpSchema,
  ProposedCreateFolderOpSchema,
  ProposedDeleteFileOpSchema,
]);
export type ProposedFileOperation = z.infer<typeof ProposedFileOperationSchema>;

export const CodeChangePlanSchema = z.object({
  summary: z.string().min(1, 'Summary cannot be empty'),
  operations: z.array(ProposedFileOperationSchema).min(1, 'At least one file operation is required'),
  testStrategy: z.string().default('Verify functionality with unit tests'),
  risks: z.array(z.string()).default([]),
});
export type CodeChangePlan = z.infer<typeof CodeChangePlanSchema>;

export const TestPlanSchema = z.object({
  strategy: z.string().min(1, 'Strategy cannot be empty'),
  filesToCreate: z.array(z.string()).default([]),
  filesToUpdate: z.array(z.string()).default([]),
  commands: z.array(z.string()).min(1, 'At least one test command is required'),
});
export type TestPlan = z.infer<typeof TestPlanSchema>;

export const CodeReviewResultSchema = z.object({
  verdict: z.enum(['approve', 'revise', 'block']),
  score: z.number().min(0).max(100),
  issues: z.array(z.string()).default([]),
  requiredChanges: z.array(z.string()).default([]),
  testCoverageAssessment: z.string().default('Test coverage verified'),
});
export type CodeReviewResult = z.infer<typeof CodeReviewResultSchema>;

export const UnifiedDiffSchema = z.object({
  filePath: z.string(),
  changeType: z.enum(['create', 'edit', 'delete']),
  oldContent: z.string().nullable().optional(),
  newContent: z.string().nullable().optional(),
  unifiedDiff: z.string(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  originalSha256: z.string().optional(),
});
export type UnifiedDiff = z.infer<typeof UnifiedDiffSchema>;

export const ChangesetStatusSchema = z.enum([
  'proposed',
  'awaiting_approval',
  'approved',
  'rejected',
  'applied',
  'failed',
  'stale',
]);
export type ChangesetStatus = z.infer<typeof ChangesetStatusSchema>;

export const ProposedChangesetSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  nodeId: z.string().min(1),
  agentRole: AgentRoleSchema,
  operations: z.array(ProposedFileOperationSchema),
  diffs: z.array(UnifiedDiffSchema),
  fileHashes: z.record(z.string(), z.string()).default({}),
  status: ChangesetStatusSchema,
  summary: z.string(),
  additions: z.number().int().nonnegative().default(0),
  deletions: z.number().int().nonnegative().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
  approvedBy: z.string().optional(),
  approvedAt: z.string().optional(),
  rejectedBy: z.string().optional(),
  rejectedAt: z.string().optional(),
  appliedAt: z.string().optional(),
  failureReason: z.string().optional(),
});
export type ProposedChangeset = z.infer<typeof ProposedChangesetSchema>;

