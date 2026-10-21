import { z } from 'zod';
import { existsSync, renameSync, mkdirSync } from 'fs';
import { resolve, basename } from 'path';
import { Tool, ToolContext, ToolResult } from '../tool.interface.js';
import { pathGuard } from '../../workspace/path-guard.js';
import { diffService } from '../../workspace/diff.service.js';
import { workspaceService } from '../../workspace/workspace.service.js';
import { resolveStorageDir } from '../../config/config.js';
import { generateId } from '../../../utils/ids.js';
import { getTimestamp } from '../../../utils/time.js';

const DeleteFileInputSchema = z
  .object({
    filePath: z.string().optional(),
    path: z.string().optional(),
    reason: z.string().optional(),
  })
  .refine((data) => Boolean(data.filePath || data.path), {
    message: 'Either filePath or path must be provided',
  })
  .transform((data) => ({
    filePath: (data.filePath || data.path)!,
    reason: data.reason,
  }));

export class DeleteFileTool implements Tool {
  readonly name = 'delete_file';
  readonly description = 'Safely remove a file from workspace by moving it to the Chatterbox task trash directory';
  readonly requiredPermissions = ['file:write'];

  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const parseRes = DeleteFileInputSchema.safeParse(input);
    if (!parseRes.success) {
      return {
        ok: false,
        error: `Invalid input for ${this.name}: ${parseRes.error.errors.map((e) => e.message).join('; ')}`,
      };
    }

    const { filePath, reason } = parseRes.data;
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

    if (!existsSync(safeTarget)) {
      return {
        ok: false,
        error: `File not found: "${filePath}"`,
      };
    }

    // 1. Propose delete diff
    diffService.proposeDelete(safeTarget, filePath);

    // 2. Safely move to task trash directory (no permanent unrecoverable deletion)
    const storageDir = resolveStorageDir();
    const trashDir = resolve(storageDir, 'trash', context.taskId);
    mkdirSync(trashDir, { recursive: true });

    const trashTarget = resolve(trashDir, `${Date.now()}_${basename(safeTarget)}`);
    try {
      renameSync(safeTarget, trashTarget);
    } catch (err: unknown) {
      return {
        ok: false,
        error: `Failed to move file to trash: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // 3. Publish file_deleted
    await context.eventBus.publish({
      eventId: generateId('evt'),
      taskId: context.taskId,
      nodeId: context.nodeId,
      type: 'file_deleted',
      timestamp: getTimestamp(),
      actorType: 'agent',
      actorId: context.actorId,
      correlationId: context.correlationId,
      payload: {
        filePath,
        trashLocation: trashTarget,
        reason,
      },
    });

    return {
      ok: true,
      data: {
        filePath,
        deleted: true,
        trashPath: trashTarget,
      },
    };
  }
}
