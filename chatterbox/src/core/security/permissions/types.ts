import { AgentRole } from '../../models/enums.js';

export type Permission =
  | 'task:create'
  | 'task:read'
  | 'task:resume'
  | 'artifact:read'
  | 'artifact:create'
  | 'file:read'
  | 'file:write'
  | 'shell:execute'
  | 'network:request'
  | 'secret:read';

export type AgentPermissions = {
  role: AgentRole;
  allowed: Permission[];
  denied: Permission[];
};

export type PermissionDecision = {
  allowed: boolean;
  permission: Permission;
  agentRole: AgentRole;
  reason: string;
  requiresApproval: boolean;
};

export interface PermissionCheckInput {
  agentRole: AgentRole;
  permission: Permission;
  resource?: string;
  taskId?: string;
  context?: Record<string, unknown>;
}

export interface PermissionService {
  check(input: PermissionCheckInput): Promise<PermissionDecision>;
  getPermissionsForRole(role: AgentRole): AgentPermissions;
}

export const ROLE_PERMISSIONS: Record<AgentRole, AgentPermissions> = {
  planner: {
    role: 'planner',
    allowed: ['task:create', 'task:read', 'task:resume', 'artifact:read', 'artifact:create'],
    denied: ['file:write', 'file:read', 'shell:execute', 'secret:read', 'network:request'],
  },
  explorer: {
    role: 'explorer',
    allowed: ['task:read', 'artifact:read', 'artifact:create', 'file:read'],
    denied: ['file:write', 'shell:execute', 'secret:read', 'network:request', 'task:create', 'task:resume'],
  },
  researcher: {
    role: 'researcher',
    allowed: ['task:read', 'artifact:read', 'artifact:create', 'network:request'],
    denied: ['shell:execute', 'secret:read', 'file:write', 'task:create', 'task:resume'],
  },
  analyst: {
    role: 'analyst',
    allowed: ['task:read', 'artifact:read', 'artifact:create'],
    denied: ['shell:execute', 'secret:read', 'file:write', 'network:request', 'task:create', 'task:resume'],
  },
  writer: {
    role: 'writer',
    allowed: ['task:read', 'artifact:read', 'artifact:create'],
    denied: ['shell:execute', 'secret:read', 'file:write', 'network:request', 'task:create', 'task:resume'],
  },
  reviewer: {
    role: 'reviewer',
    allowed: ['task:read', 'artifact:read', 'artifact:create', 'file:read'],
    denied: ['shell:execute', 'secret:read', 'file:write', 'network:request', 'task:create', 'task:resume'],
  },
  coder: {
    role: 'coder',
    allowed: ['task:read', 'artifact:read', 'artifact:create', 'file:read', 'file:write'],
    denied: ['shell:execute', 'secret:read', 'network:request', 'task:create', 'task:resume'],
  },
  tester: {
    role: 'tester',
    allowed: ['task:read', 'artifact:read', 'artifact:create', 'file:read', 'file:write', 'shell:execute'],
    denied: ['secret:read', 'network:request', 'task:create', 'task:resume'],
  },
};
