import { ArtifactService } from '../artifacts/artifact.service.js';
import { EventBus } from '../events/event-bus.js';
import { PermissionService } from '../security/permissions/types.js';
import { ApprovalEngine } from '../security/approvals/approval-engine.js';

export type ToolResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
};

export interface ToolContext {
  taskId: string;
  nodeId?: string;
  actorId: string;
  agentRole?: string;
  correlationId: string;
  artifactService: ArtifactService;
  eventBus: EventBus;
  permissionService?: PermissionService;
  approvalEngine?: ApprovalEngine;
  workspaceRoot?: string;
  mode?: 'read-only' | 'workspace-write' | 'supervised';
}

export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly requiredPermissions: string[];
  execute(input: unknown, context: ToolContext): Promise<ToolResult>;
}

export interface ToolRegistry {
  register(tool: Tool): void;
  get(name: string): Tool | undefined;
  list(): Tool[];
  execute(name: string, input: unknown, context: ToolContext): Promise<ToolResult>;
}
