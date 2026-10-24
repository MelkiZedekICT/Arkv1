import { AgentRole } from '../../models/enums.js';

export type RiskLevel = 'low' | 'medium' | 'high';

export type ActionRisk =
  | 'read_artifact'
  | 'create_artifact'
  | 'web_search'
  | 'write_file'
  | 'execute_shell'
  | 'network_request'
  | 'access_secret'
  | 'read_file'
  | 'search_workspace'
  | 'list_directory'
  | 'create_folder'
  | 'create_file'
  | 'edit_file'
  | 'delete_file'
  | 'apply_changeset'
  | 'run_command';


export type ApprovalRequest = {
  taskId: string;
  nodeId?: string;
  agentRole: AgentRole;
  action: ActionRisk;
  target?: string;
  targetPath?: string;
  command?: string;
  diffSnippet?: string;
  payload: Record<string, unknown>;
  riskLevel: RiskLevel;
  reason: string;
};

export type DecisionType = 'approve' | 'reject' | 'edit_instruction' | 'view_diff';

export type ApprovalDecision = {
  approved: boolean;
  decisionType?: DecisionType;
  approverId: string;
  decidedAt: string;
  reason?: string;
  editedInstruction?: string;
  diffHash?: string;
};

export type PolicyEvaluation = {
  autoAllow: boolean;
  requiresApproval: boolean;
  denied: boolean;
  riskLevel: RiskLevel;
  reason: string;
};
