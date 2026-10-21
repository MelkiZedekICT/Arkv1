import { z } from 'zod';
import { existsSync, mkdirSync } from 'fs';
import { Tool, ToolContext, ToolResult } from '../tool.interface.js';
import { pathGuard } from '../../workspace/path-guard.js';
import { workspaceService } from '../../workspace/workspace.service.js';
import { generateId } from '../../../utils/ids.js';
import { getTimestamp } from '../../../utils/time.js';

const CreateFolderInputSchema = z
  .object({
    folderPath: z.string().optional(),
    path: z.string().optional(),
  })
  .refine((data) => Boolean(data.folderPath || data.path), {
    message: 'Either folderPath or path must be provided',
  })
  .transform((data) => ({
    folderPath: (data.folderPath || data.path)!,
  }));

export class CreateFolderTool implements Tool {
  readonly name = 'create_folder';
  readonly description = 'Create a new directory within the approved workspace';
  readonly requiredPermissions = ['file:write'];

  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const parseRes = CreateFolderInputSchema.safeParse(input);
    if (!parseRes.success) {
      return {
        ok: false,
        error: `Invalid input for ${this.name}: ${parseRes.error.errors.map((e) => e.message).join('; ')}`,
      };
    }

    const { folderPath } = parseRes.data;
    const wsRoot = context.workspaceRoot || workspaceService.getActiveWorkspace().absoluteRoot;

    let safeTarget: string;
    try {
      safeTarget = await pathGuard.assertInsideWorkspace({
        workspaceRoot: wsRoot,
        targetPath: folderPath,
      });
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    if (existsSync(safeTarget)) {
      return {
        ok: true,
        data: {
          folderPath,
          alreadyExisted: true,
        },
      };
    }

    try {
      mkdirSync(safeTarget, { recursive: true });
    } catch (err: unknown) {
      return {
        ok: false,
        error: `Failed to create folder "${folderPath}": ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    await context.eventBus.publish({
      eventId: generateId('evt'),
      taskId: context.taskId,
      nodeId: context.nodeId,
      type: 'folder_created',
      timestamp: getTimestamp(),
      actorType: 'agent',
      actorId: context.actorId,
      correlationId: context.correlationId,
      payload: {
        folderPath,
      },
    });

    return {
      ok: true,
      data: {
        folderPath,
        created: true,
      },
    };
  }
}
