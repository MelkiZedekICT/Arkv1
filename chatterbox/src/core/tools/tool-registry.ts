import { Tool, ToolContext, ToolRegistry, ToolResult } from './tool.interface.js';
import { PermissionService, Permission } from '../security/permissions/types.js';
import { ApprovalEngine } from '../security/approvals/approval-engine.js';
import { ActionRisk } from '../security/approvals/approval-types.js';
import { AgentRole } from '../models/enums.js';
import { diffService } from '../workspace/diff.service.js';
import { pathGuard } from '../workspace/path-guard.js';
import { workspaceService } from '../workspace/workspace.service.js';
import { existsSync, readFileSync } from 'fs';
import { generateId } from '../../utils/ids.js';
import { getTimestamp } from '../../utils/time.js';
import { sanitizeErrorMessage } from '../../utils/security.js';

export class DefaultToolRegistry implements ToolRegistry {
  private tools = new Map<string, Tool>();
  private permissionService?: PermissionService;
  private approvalEngine?: ApprovalEngine;

  constructor(options?: { permissionService?: PermissionService; approvalEngine?: ApprovalEngine }) {
    this.permissionService = options?.permissionService;
    this.approvalEngine = options?.approvalEngine;
  }

  setSecurityServices(permissionService?: PermissionService, approvalEngine?: ApprovalEngine): void {
    if (permissionService) this.permissionService = permissionService;
    if (approvalEngine) this.approvalEngine = approvalEngine;
  }

  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered.`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  async execute(name: string, input: unknown, context: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        ok: false,
        error: `Tool "${name}" is not registered. Available tools: ${Array.from(this.tools.keys()).join(', ')}`,
      };
    }

    const toolCallId = generateId('call');
    const inputRecord =
      typeof input === 'object' && input !== null
        ? (input as Record<string, unknown>)
        : { input };

    const rawRole = (context.agentRole || context.actorId?.replace(/^agent_/, '') || '') as string;
    const agentRole = (['planner', 'explorer', 'researcher', 'analyst', 'writer', 'reviewer', 'coder', 'tester'].includes(rawRole)
      ? rawRole
      : 'explorer') as AgentRole;

    // 1. Permission Check Interceptor
    const permService = context.permissionService || this.permissionService;
    if (permService) {
      for (const requiredPerm of tool.requiredPermissions) {
        const decision = await permService.check({
          agentRole,
          permission: requiredPerm as Permission,
          resource: (inputRecord.filename as string) || (inputRecord.path as string) || (inputRecord.filePath as string),
          taskId: context.taskId,
          context: { nodeId: context.nodeId, correlationId: context.correlationId },
        });

        if (!decision.allowed) {
          return {
            ok: false,
            error: `Permission denied: ${requiredPerm}. ${decision.reason}`,
          };
        }
      }
    }

    // 2. Approval Policy Interceptor
    const apprEngine = context.approvalEngine || this.approvalEngine;
    if (apprEngine) {
      let actionRisk: ActionRisk = 'create_artifact';
      if (name === 'read_file') actionRisk = 'read_file';
      else if (name === 'search_workspace') actionRisk = 'search_workspace';
      else if (name === 'list_directory') actionRisk = 'list_directory';
      else if (name === 'create_folder') actionRisk = 'create_folder';
      else if (name === 'create_file') actionRisk = 'create_file';
      else if (name === 'edit_file') actionRisk = 'edit_file';
      else if (name === 'delete_file') actionRisk = 'delete_file';
      else if (name === 'run_command') actionRisk = 'run_command';
      else if (name.includes('search')) actionRisk = 'web_search';
      else if (name.includes('read')) actionRisk = 'read_artifact';
      else if (name.includes('artifact')) actionRisk = 'create_artifact';
      else if (name.includes('file')) actionRisk = 'write_file';
      else if (name.includes('shell')) actionRisk = 'execute_shell';

      const targetPath = (inputRecord.path as string) || (inputRecord.filePath as string) || (inputRecord.folderPath as string) || (inputRecord.filename as string);
      const command = (inputRecord.command as string) || undefined;
      let diffSnippet = (inputRecord.diffSnippet as string) || undefined;
      let proposedAdditions = 0;
      let proposedDeletions = 0;
      const wsRoot = context.workspaceRoot || workspaceService.getActiveWorkspace().absoluteRoot;

      // Handle path guards & diff pre-generation for file operations
      try {
        if (name === 'create_file' && targetPath && typeof inputRecord.content === 'string') {
          const safeTarget = await pathGuard.assertInsideWorkspace({ workspaceRoot: wsRoot, targetPath });
          if (existsSync(safeTarget)) {
            return { ok: false, error: `File already exists: "${targetPath}". Use edit_file to modify existing files.` };
          }
          const diff = diffService.proposeCreate(targetPath, inputRecord.content);
          diffSnippet = diff.unifiedDiff;
          proposedAdditions = diff.additions;
          proposedDeletions = diff.deletions;

          await context.eventBus.publish({
            eventId: generateId('evt'),
            taskId: context.taskId,
            nodeId: context.nodeId,
            type: 'file_create_proposed',
            timestamp: getTimestamp(),
            actorType: 'agent',
            actorId: context.actorId,
            correlationId: context.correlationId,
            payload: { filePath: targetPath, bytes: Buffer.byteLength(inputRecord.content, 'utf8'), diffSnippet: diffSnippet.slice(0, 500) },
          });

          await context.eventBus.publish({
            eventId: generateId('evt'),
            taskId: context.taskId,
            nodeId: context.nodeId,
            type: 'diff_proposed',
            timestamp: getTimestamp(),
            actorType: 'agent',
            actorId: context.actorId,
            correlationId: context.correlationId,
            payload: { filePath: targetPath, changeType: 'create', additions: proposedAdditions, deletions: proposedDeletions, diffSnippet: diffSnippet.slice(0, 500) },
          });
        } else if (name === 'edit_file' && targetPath) {
          const safeTarget = await pathGuard.assertInsideWorkspace({ workspaceRoot: wsRoot, targetPath });
          if (!existsSync(safeTarget)) {
            return { ok: false, error: `File not found: "${targetPath}". Use create_file to create new files.` };
          }
          const curContent = readFileSync(safeTarget, 'utf8');
          let newContent = inputRecord.content as string | undefined;
          if (newContent === undefined && inputRecord.find !== undefined && inputRecord.replace !== undefined) {
            if (!curContent.includes(inputRecord.find as string)) {
              return { ok: false, error: `Search target not found in "${targetPath}": "${(inputRecord.find as string).slice(0, 80)}"` };
            }
            newContent = curContent.replace(inputRecord.find as string, inputRecord.replace as string);
          }
          if (newContent !== undefined) {
            const diff = diffService.proposeEdit(safeTarget, targetPath, newContent);
            diffSnippet = diff.unifiedDiff;
            proposedAdditions = diff.additions;
            proposedDeletions = diff.deletions;

            await context.eventBus.publish({
              eventId: generateId('evt'),
              taskId: context.taskId,
              nodeId: context.nodeId,
              type: 'file_edit_proposed',
              timestamp: getTimestamp(),
              actorType: 'agent',
              actorId: context.actorId,
              correlationId: context.correlationId,
              payload: { filePath: targetPath, additions: proposedAdditions, deletions: proposedDeletions, diffSnippet: diffSnippet.slice(0, 500) },
            });

            await context.eventBus.publish({
              eventId: generateId('evt'),
              taskId: context.taskId,
              nodeId: context.nodeId,
              type: 'diff_proposed',
              timestamp: getTimestamp(),
              actorType: 'agent',
              actorId: context.actorId,
              correlationId: context.correlationId,
              payload: { filePath: targetPath, changeType: 'edit', additions: proposedAdditions, deletions: proposedDeletions, diffSnippet: diffSnippet.slice(0, 500) },
            });
          }
        } else if (name === 'delete_file' && targetPath) {
          const safeTarget = await pathGuard.assertInsideWorkspace({ workspaceRoot: wsRoot, targetPath });
          if (!existsSync(safeTarget)) {
            return { ok: false, error: `File not found: "${targetPath}"` };
          }
          const diff = diffService.proposeDelete(safeTarget, targetPath);
          diffSnippet = diff.unifiedDiff;
          proposedDeletions = diff.deletions;

          await context.eventBus.publish({
            eventId: generateId('evt'),
            taskId: context.taskId,
            nodeId: context.nodeId,
            type: 'file_delete_proposed',
            timestamp: getTimestamp(),
            actorType: 'agent',
            actorId: context.actorId,
            correlationId: context.correlationId,
            payload: { filePath: targetPath, reason: (inputRecord.reason as string) || 'delete requested' },
          });

          await context.eventBus.publish({
            eventId: generateId('evt'),
            taskId: context.taskId,
            nodeId: context.nodeId,
            type: 'diff_proposed',
            timestamp: getTimestamp(),
            actorType: 'agent',
            actorId: context.actorId,
            correlationId: context.correlationId,
            payload: { filePath: targetPath, changeType: 'delete', additions: 0, deletions: proposedDeletions, diffSnippet: diffSnippet.slice(0, 500) },
          });
        } else if (name === 'create_folder' && targetPath) {
          await pathGuard.assertInsideWorkspace({ workspaceRoot: wsRoot, targetPath });
          await context.eventBus.publish({
            eventId: generateId('evt'),
            taskId: context.taskId,
            nodeId: context.nodeId,
            type: 'folder_create_proposed',
            timestamp: getTimestamp(),
            actorType: 'agent',
            actorId: context.actorId,
            correlationId: context.correlationId,
            payload: { folderPath: targetPath },
          });
        }
      } catch (err: unknown) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }

      if (name === 'run_command' && command) {
        await context.eventBus.publish({
          eventId: generateId('evt'),
          taskId: context.taskId,
          nodeId: context.nodeId,
          type: 'command_proposed',
          timestamp: getTimestamp(),
          actorType: 'agent',
          actorId: context.actorId,
          correlationId: context.correlationId,
          payload: { command, cwd: wsRoot },
        });
      }

      const isAllowlisted = command ? workspaceService.isCommandAllowed(command) : undefined;

      const decision = await apprEngine.requestApproval({
        taskId: context.taskId,
        nodeId: context.nodeId,
        agentRole,
        action: actionRisk,
        target: targetPath,
        targetPath,
        command,
        diffSnippet,
        payload: {
          ...inputRecord,
          mode: context.mode,
          isAllowlistedCommand: isAllowlisted,
        },
        riskLevel: actionRisk === 'delete_file' ? 'high' : 'medium',
        reason: `Executing tool "${name}"`,
      });

      if (!decision.approved) {
        if (diffSnippet && targetPath) {
          const changeType = name === 'create_file' ? 'create' : name === 'delete_file' ? 'delete' : 'edit';
          await context.eventBus.publish({
            eventId: generateId('evt'),
            taskId: context.taskId,
            nodeId: context.nodeId,
            type: 'diff_rejected',
            timestamp: getTimestamp(),
            actorType: 'system',
            actorId: decision.approverId,
            correlationId: context.correlationId,
            payload: { filePath: targetPath, changeType, rejectedBy: decision.approverId, reason: decision.reason },
          });
        } else if (command) {
          await context.eventBus.publish({
            eventId: generateId('evt'),
            taskId: context.taskId,
            nodeId: context.nodeId,
            type: 'command_rejected',
            timestamp: getTimestamp(),
            actorType: 'system',
            actorId: decision.approverId,
            correlationId: context.correlationId,
            payload: { command, reason: decision.reason || 'Rejected by operator/policy' },
          });
        }

        return {
          ok: false,
          error: `Action denied by policy or operator: ${decision.reason}`,
        };
      }

      // Action approved
      if (diffSnippet && targetPath) {
        const changeType = name === 'create_file' ? 'create' : name === 'delete_file' ? 'delete' : 'edit';
        await context.eventBus.publish({
          eventId: generateId('evt'),
          taskId: context.taskId,
          nodeId: context.nodeId,
          type: 'diff_approved',
          timestamp: getTimestamp(),
          actorType: 'user',
          actorId: decision.approverId,
          correlationId: context.correlationId,
          payload: { filePath: targetPath, changeType, approvedBy: decision.approverId },
        });
      } else if (command) {
        await context.eventBus.publish({
          eventId: generateId('evt'),
          taskId: context.taskId,
          nodeId: context.nodeId,
          type: 'command_approved',
          timestamp: getTimestamp(),
          actorType: 'user',
          actorId: decision.approverId,
          correlationId: context.correlationId,
          payload: { command, approvedBy: decision.approverId },
        });
      }
    }

    // 3. Publish tool_call_started
    await context.eventBus.publish({
      eventId: generateId('evt'),
      taskId: context.taskId,
      nodeId: context.nodeId,
      type: 'tool_call_started',
      timestamp: getTimestamp(),
      actorType: 'agent',
      actorId: context.actorId,
      correlationId: context.correlationId,
      payload: {
        toolName: name,
        toolCallId,
        input: inputRecord,
        nodeId: context.nodeId,
      },
    });

    const startTime = Date.now();
    let result: ToolResult;

    try {
      result = await tool.execute(input, context);
    } catch (err) {
      result = {
        ok: false,
        error: sanitizeErrorMessage(err),
      };
    }

    const durationMs = Math.max(1, Date.now() - startTime);

    // 2. Publish tool_call_completed
    await context.eventBus.publish({
      eventId: generateId('evt'),
      taskId: context.taskId,
      nodeId: context.nodeId,
      type: 'tool_call_completed',
      timestamp: getTimestamp(),
      actorType: 'agent',
      actorId: context.actorId,
      correlationId: context.correlationId,
      payload: {
        toolName: name,
        toolCallId,
        output: result.ok ? result.data : { error: result.error },
        durationMs,
        nodeId: context.nodeId,
      },
    });

    return result;
  }
}
