import { z } from 'zod';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { Tool, ToolContext, ToolResult } from '../tool.interface.js';
import { pathGuard } from '../../workspace/path-guard.js';
import { diffService } from '../../workspace/diff.service.js';
import { workspaceService } from '../../workspace/workspace.service.js';
import { generateId } from '../../../utils/ids.js';
import { getTimestamp } from '../../../utils/time.js';

const CreateFileInputSchema = z
  .object({
    filePath: z.string().optional(),
    path: z.string().optional(),
    content: z.string(),
  })
  .refine((data) => Boolean(data.filePath || data.path), {
    message: 'Either filePath or path must be provided',
  })
  .transform((data) => ({
    filePath: (data.filePath || data.path)!,
    content: data.content,
  }));

export class CreateFileTool implements Tool {
  readonly name = 'create_file';
  readonly description = 'Create a new file within the approved workspace with proposed content';
  readonly requiredPermissions = ['file:write'];

  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const parseRes = CreateFileInputSchema.safeParse(input);
    if (!parseRes.success) {
      return {
        ok: false,
        error: `Invalid input for ${this.name}: ${parseRes.error.errors.map((e) => e.message).join('; ')}`,
      };
    }

    const { filePath, content } = parseRes.data;
    const wsRoot = context.workspaceRoot || workspaceService.getActiveWorkspace().absoluteRoot;

    let safeTarget: string;
    try {
      safeTarget = await pathGuard.assertInsideWorkspace({
        workspaceRoot: wsRoot,
        targetPath: filePath,
      });
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    if (existsSync(safeTarget)) {
      return {
        ok: false,
        error: `File already exists: "${filePath}". Use edit_file to modify existing files.`,
      };
    }

    // 1. Generate unified diff
    const proposedDiff = diffService.proposeCreate(filePath, content);

    // 3. Write file
    try {
      const parentDir = dirname(safeTarget);
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true });
      }
      writeFileSync(safeTarget, content, 'utf8');
    } catch (err: unknown) {
      return {
        ok: false,
        error: `Failed to write file "${filePath}": ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // 4. Publish diff_applied and file_created
    await context.eventBus.publish({
      eventId: generateId('evt'),
      taskId: context.taskId,
      nodeId: context.nodeId,
      type: 'diff_applied',
      timestamp: getTimestamp(),
      actorType: 'agent',
      actorId: context.actorId,
      correlationId: context.correlationId,
      payload: {
        filePath,
        changeType: 'create',
      },
    });

    await context.eventBus.publish({
      eventId: generateId('evt'),
      taskId: context.taskId,
      nodeId: context.nodeId,
      type: 'file_created',
      timestamp: getTimestamp(),
      actorType: 'agent',
      actorId: context.actorId,
      correlationId: context.correlationId,
      payload: {
        filePath,
        bytes: Buffer.byteLength(content, 'utf8'),
      },
    });

    return {
      ok: true,
      data: {
        filePath,
        created: true,
        diff: proposedDiff,
      },
    };
  }
}
