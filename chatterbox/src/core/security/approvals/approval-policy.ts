import { ActionRisk, PolicyEvaluation, RiskLevel } from './approval-types.js';
import { WorkspaceMode } from '../../workspace/workspace.service.js';

export interface ActionContext {
  action: ActionRisk;
  taskId: string;
  target?: string;
  mode?: WorkspaceMode;
  isAllowlistedCommand?: boolean;
  isInsideWorkspace?: boolean;
  riskLevel?: RiskLevel;
  payload?: Record<string, unknown>;
}

export class ApprovalPolicy {
  /**
   * Statically evaluates risk level and approval requirement for an action.
   * Completely independent of agent prompts and runner logic.
   */
  evaluate(context: ActionContext): PolicyEvaluation {
    const { action, taskId, target, mode = 'supervised', isAllowlistedCommand, riskLevel } = context;

    switch (action) {
      // 1. Secret Access: Denied unconditionally across all modes
      case 'access_secret':
        return {
          autoAllow: false,
          requiresApproval: false,
          denied: true,
          riskLevel: 'high',
          reason: 'Accessing secrets is strictly prohibited in AgentFeed.',
        };

      // 2. Read workspace file: Allowed across all modes
      case 'read_file':
      case 'read_artifact':
      case 'list_directory':
        return {
          autoAllow: true,
          requiresApproval: false,
          denied: false,
          riskLevel: 'low',
          reason: 'Reading files/directories inside the workspace is low risk.',
        };

      // 3. Search workspace: Allowed across all modes
      case 'search_workspace':
      case 'web_search':
        return {
          autoAllow: true,
          requiresApproval: false,
          denied: false,
          riskLevel: 'low',
          reason: 'Searching workspace or mock search is safe and auto-allowed.',
        };

      // 4. Create folder / Create file / Edit file:
      // read-only: Prohibited
      // workspace-write: Allowed inside workspace
      // supervised: Requires Approval
      case 'create_folder':
      case 'create_file':
      case 'edit_file': {
        if (mode === 'read-only') {
          return {
            autoAllow: false,
            requiresApproval: false,
            denied: true,
            riskLevel: 'high',
            reason: `Workspace read-only mode prohibits file creation and modification (${action}).`,
          };
        }

        if (mode === 'workspace-write') {
          return {
            autoAllow: true,
            requiresApproval: false,
            denied: false,
            riskLevel: 'low',
            reason: `Action "${action}" is auto-allowed in workspace-write mode.`,
          };
        }

        // 'supervised' requires explicit human approval
        return {
          autoAllow: false,
          requiresApproval: true,
          denied: false,
          riskLevel: 'medium',
          reason: `Action "${action}" requires explicit approval in supervised mode.`,
        };
      }

      // 5. Delete file: Prohibited in read-only, requires approval in workspace-write and supervised
      case 'delete_file': {
        if (mode === 'read-only') {
          return {
            autoAllow: false,
            requiresApproval: false,
            denied: true,
            riskLevel: 'high',
            reason: 'Workspace read-only mode prohibits file deletion.',
          };
        }

        return {
          autoAllow: false,
          requiresApproval: true,
          denied: false,
          riskLevel: 'high',
          reason: 'Deleting files is irreversible and requires explicit human approval.',
        };
      }

      // 5b. Apply multi-file Changeset
      case 'apply_changeset': {
        const containsDelete = Boolean(context.payload?.containsDelete);
        if (mode === 'read-only') {
          return {
            autoAllow: false,
            requiresApproval: false,
            denied: true,
            riskLevel: 'high',
            reason: 'Workspace read-only mode prohibits applying changesets.',
          };
        }

        if (mode === 'workspace-write') {
          if (containsDelete) {
            return {
              autoAllow: false,
              requiresApproval: true,
              denied: false,
              riskLevel: 'high',
              reason: 'Changeset contains file deletion which requires explicit approval even in workspace-write mode.',
            };
          }
          return {
            autoAllow: true,
            requiresApproval: false,
            denied: false,
            riskLevel: 'low',
            reason: 'Changeset is auto-allowed in workspace-write mode.',
          };
        }

        // 'supervised' requires explicit human approval
        return {
          autoAllow: false,
          requiresApproval: true,
          denied: false,
          riskLevel: containsDelete ? 'high' : 'medium',
          reason: `Changeset requires explicit approval in supervised mode.`,
        };
      }


      // 6. Run commands:
      case 'execute_shell':
        return {
          autoAllow: false,
          requiresApproval: true,
          denied: false,
          riskLevel: riskLevel || 'high',
          reason: 'Arbitrary shell execution is high risk and requires explicit human approval.',
        };

      case 'run_command': {
        if (isAllowlistedCommand === false) {
          return {
            autoAllow: false,
            requiresApproval: false,
            denied: true,
            riskLevel: 'high',
            reason: 'Running non-allowlisted commands is denied by security policy.',
          };
        }

        // Allowlisted commands still require approval in v1
        return {
          autoAllow: false,
          requiresApproval: true,
          denied: false,
          riskLevel: riskLevel === 'high' ? 'high' : 'medium',
          reason: 'Executing commands requires explicit human approval in all modes.',
        };
      }

      case 'create_artifact': {
        const isInsideTaskDir = this.isTargetWithinTaskDir(target, taskId);
        if (isInsideTaskDir) {
          return {
            autoAllow: true,
            requiresApproval: false,
            denied: false,
            riskLevel: 'low',
            reason: 'Creating artifact within the task directory is low risk.',
          };
        }
        return {
          autoAllow: false,
          requiresApproval: true,
          denied: false,
          riskLevel: 'high',
          reason: 'Creating artifact outside the task directory requires human approval.',
        };
      }

      case 'write_file': {
        const isInsideTaskDir = this.isTargetWithinTaskDir(target, taskId);
        if (isInsideTaskDir) {
          return {
            autoAllow: false,
            requiresApproval: true,
            denied: false,
            riskLevel: 'medium',
            reason: 'Writing file requires approval.',
          };
        }
        return {
          autoAllow: false,
          requiresApproval: true,
          denied: false,
          riskLevel: 'high',
          reason: 'Writing file outside task directory requires explicit human approval.',
        };
      }

      case 'network_request': {
        const url = (target || (context.payload?.url as string) || '').toLowerCase();
        if (url.includes('example.com') || url.includes('mock') || !url) {
          return {
            autoAllow: true,
            requiresApproval: false,
            denied: false,
            riskLevel: 'low',
            reason: 'Mock network request within allowlist.',
          };
        }
        return {
          autoAllow: false,
          requiresApproval: true,
          denied: false,
          riskLevel: 'high',
          reason: `External network request to "${url}" requires human approval.`,
        };
      }

      default:
        return {
          autoAllow: false,
          requiresApproval: true,
          denied: false,
          riskLevel: 'high',
          reason: `Unrecognized action "${action}" requires approval by default.`,
        };
    }
  }

  private isTargetWithinTaskDir(target: string | undefined, taskId: string): boolean {
    if (!target) return true;
    const normalized = target.replace(/\\/g, '/').toLowerCase();
    if (!normalized.includes('/')) return true;
    const expected = `artifacts/${taskId.toLowerCase()}`;
    return normalized.includes(expected);
  }
}

export const approvalPolicy = new ApprovalPolicy();
