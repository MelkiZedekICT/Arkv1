import { z } from 'zod';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { Tool, ToolContext, ToolResult } from '../tool.interface.js';
import { pathGuard } from '../../workspace/path-guard.js';
import { diffService } from '../../workspace/diff.service.js';
import { workspaceService } from '../../workspace/workspace.service.js';
import { generateId } from '../../../utils/ids.js';
import { getTimestamp } from '../../../utils/time.js';

const EditFileInputSchema = z
  .object({
    filePath: z.string().optional(),
    path: z.string().optional(),
    content: z.string().optional(),
    find: z.string().optional(),
    replace: z.string().optional(),
  })
  .refine((data) => Boolean(data.filePath || data.path), {
    message: 'Either filePath or path must be provided',
  })
  .transform((data) => ({
    filePath: (data.filePath || data.path)!,
    content: data.content,
    find: data.find,
    replace: data.replace,
  }));

export class EditFileTool implements Tool {
  readonly name = 'edit_file';
  readonly description = 'Edit an existing file in approved workspace using replacement or search/replace with proposed diff';
  readonly requiredPermissions = ['file:write'];

  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const parseRes = EditFileInputSchema.safeParse(input);
    if (!parseRes.success) {
      return {
        ok: false,
        error: `Invalid input for ${this.name}: ${parseRes.error.errors.map((e) => e.message).join('; ')}`,
      };
    }

    const { filePath, content, find, replace } = parseRes.data;
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
        error: `File not found: "${filePath}". Use create_file to create new files.`,
      };
    }

    const existingContent = readFileSync(safeTarget, 'utf8');
    let newContent: string;

    if (content !== undefined) {
      newContent = content;
    } else if (find !== undefined && replace !== undefined) {
      if (!existingContent.includes(find)) {
        return {
          ok: false,
          error: `Search target not found in "${filePath}": "${find.slice(0, 80)}"`,
        };
      }
      newContent = existingContent.replace(find, replace);
    } else {
      return {
        ok: false,
        error: 'Must provide either "content" for replacement or both "find" and "replace" for search/replace.',
      };
    }

    // 1. Propose diff
    const proposedDiff = diffService.proposeEdit(safeTarget, filePath, newContent);

    // 3. Write changes
    try {
      writeFileSync(safeTarget, newContent, 'utf8');
    } catch (err: unknown) {
      return {
        ok: false,
        error: `Failed to write edits to "${filePath}": ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // 4. Publish diff_applied and file_edited
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
        changeType: 'edit',
      },
    });

    await context.eventBus.publish({
      eventId: generateId('evt'),
      taskId: context.taskId,
      nodeId: context.nodeId,
      type: 'file_edited',
      timestamp: getTimestamp(),
      actorType: 'agent',
      actorId: context.actorId,
      correlationId: context.correlationId,
      payload: {
        filePath,
        bytes: Buffer.byteLength(newContent, 'utf8'),
        additions: proposedDiff.additions,
        deletions: proposedDiff.deletions,
      },
    });

    return {
      ok: true,
      data: {
        filePath,
        edited: true,
        diff: proposedDiff,
      },
    };
  }
}
