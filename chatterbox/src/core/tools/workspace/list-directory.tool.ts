import { z } from 'zod';
import { readdirSync, lstatSync, existsSync } from 'fs';
import { relative, join } from 'path';
import { Tool, ToolContext, ToolResult } from '../tool.interface.js';
import { pathGuard } from '../../workspace/path-guard.js';
import { isPathProtected } from '../../workspace/protected-paths.js';
import { workspaceService } from '../../workspace/workspace.service.js';

const ListDirectoryInputSchema = z.object({
  directoryPath: z.string().optional().default('.'),
});

export interface DirectoryItem {
  name: string;
  relativePath: string;
  type: 'file' | 'directory' | 'other';
  sizeBytes?: number;
}

export class ListDirectoryTool implements Tool {
  readonly name = 'list_directory';
  readonly description = 'List files and subdirectories within approved workspace directory';
  readonly requiredPermissions = ['file:read'];

  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const parseRes = ListDirectoryInputSchema.safeParse(input || {});
    if (!parseRes.success) {
      return {
        ok: false,
        error: `Invalid input for ${this.name}: ${parseRes.error.errors.map((e) => e.message).join('; ')}`,
      };
    }

    const { directoryPath } = parseRes.data;
    const wsRoot = context.workspaceRoot || workspaceService.getActiveWorkspace().absoluteRoot;

    let safeTarget: string;
    try {
      safeTarget = await pathGuard.assertInsideWorkspace({
        workspaceRoot: wsRoot,
        targetPath: directoryPath,
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
        error: `Directory not found: "${directoryPath}"`,
      };
    }

    const stat = lstatSync(safeTarget);
    if (!stat.isDirectory()) {
      return {
        ok: false,
        error: `Path is not a directory: "${directoryPath}"`,
      };
    }

    let entries: string[];
    try {
      entries = readdirSync(safeTarget);
    } catch (err: unknown) {
      return {
        ok: false,
        error: `Failed to read directory: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const items: DirectoryItem[] = [];
    for (const entry of entries) {
      const fullPath = join(safeTarget, entry);
      const relFromWs = relative(wsRoot, fullPath).replace(/\\/g, '/');

      // Skip protected items
      if (isPathProtected(relFromWs)) {
        continue;
      }

      try {
        const itemStat = lstatSync(fullPath);
        items.push({
          name: entry,
          relativePath: relFromWs,
          type: itemStat.isDirectory() ? 'directory' : itemStat.isFile() ? 'file' : 'other',
          sizeBytes: itemStat.isFile() ? itemStat.size : undefined,
        });
      } catch {
        // Skip unreadable files
      }
    }

    return {
      ok: true,
      data: {
        directory: directoryPath,
        count: items.length,
        items,
      },
    };
  }
}
