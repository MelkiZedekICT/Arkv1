import { AgentRole } from '../../models/enums.js';
import { EventBus } from '../../events/event-bus.js';
import { generateId } from '../../../utils/ids.js';
import { getTimestamp } from '../../../utils/time.js';
import {
  PermissionCheckInput,
  PermissionDecision,
  PermissionService,
  ROLE_PERMISSIONS,
  AgentPermissions,
} from './types.js';

export interface PermissionServiceOptions {
  eventBus?: EventBus;
}

export class DefaultPermissionService implements PermissionService {
  private readonly eventBus?: EventBus;

  constructor(options: PermissionServiceOptions = {}) {
    this.eventBus = options.eventBus;
  }

  getPermissionsForRole(role: AgentRole): AgentPermissions {
    const profile = ROLE_PERMISSIONS[role];
    if (!profile) {
      return {
        role,
        allowed: [],
        denied: [
          'task:create',
          'task:read',
          'task:resume',
          'artifact:read',
          'artifact:create',
          'file:read',
          'file:write',
          'shell:execute',
          'network:request',
          'secret:read',
        ],
      };
    }
    return profile;
  }

  async check(input: PermissionCheckInput): Promise<PermissionDecision> {
    const { agentRole, permission, resource, taskId, context } = input;
    const profile = this.getPermissionsForRole(agentRole);

    let decision: PermissionDecision;

    // 1. Unconditional denials
    if (permission === 'secret:read') {
      decision = {
        allowed: false,
        permission,
        agentRole,
        reason: 'Secret access is prohibited in AgentFeed v1.',
        requiresApproval: false,
      };
    } else if (permission === 'shell:execute') {
      if (profile.allowed.includes('shell:execute')) {
        decision = {
          allowed: true,
          permission,
          agentRole,
          reason: `Allowlisted shell execution granted to "${agentRole}" with mandatory approval.`,
          requiresApproval: true,
        };
      } else {
        decision = {
          allowed: false,
          permission,
          agentRole,
          reason: `Shell execution is disabled in AgentFeed v1 for agent role "${agentRole}".`,
          requiresApproval: false,
        };
      }
    } else if (
      (permission === 'file:write' || permission === 'artifact:create') &&
      resource &&
      taskId &&
      !profile.allowed.includes('file:write') &&
      !this.isInsideTaskDirectory(resource, taskId)
    ) {
      decision = {
        allowed: false,
        permission,
        agentRole,
        reason: `Target path "${resource}" is outside the allowed task artifact directory for task "${taskId}".`,
        requiresApproval: true,
      };
    } else if (!profile.allowed.includes(permission)) {
      // Deny by default
      decision = {
        allowed: false,
        permission,
        agentRole,
        reason: `Permission denied: agent role "${agentRole}" does not have "${permission}" permission.`,
        requiresApproval: false,
      };
    } else {
      // Allowed by explicit role policy
      decision = {
        allowed: true,
        permission,
        agentRole,
        reason: `Permission "${permission}" granted to role "${agentRole}".`,
        requiresApproval: false,
      };
    }

    // Record decision in event store / event bus if present
    if (this.eventBus && taskId) {
      try {
        await this.eventBus.publish({
          eventId: generateId('evt'),
          taskId,
          nodeId: (context?.nodeId as string) || undefined,
          type: 'permission_checked',
          timestamp: getTimestamp(),
          actorType: 'system',
          actorId: `perm_guard`,
          correlationId: (context?.correlationId as string) || generateId('corr'),
          payload: {
            agentRole,
            permission,
            resource,
            allowed: decision.allowed,
            requiresApproval: decision.requiresApproval,
            reason: decision.reason,
          },
        });
      } catch {
        // Logging should not break permission check flow
      }
    }

    return decision;
  }

  private isInsideTaskDirectory(resourcePath: string, taskId: string): boolean {
    const normalized = resourcePath.replace(/\\/g, '/').toLowerCase();
    if (!normalized.includes('/')) {
      return true;
    }
    const expectedSub = `artifacts/${taskId.toLowerCase()}`;
    return normalized.includes(expectedSub);
  }
}
