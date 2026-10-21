import { z } from 'zod';
import { readdirSync, lstatSync, readFileSync, existsSync } from 'fs';
import { relative, join } from 'path';
import { Tool, ToolContext, ToolResult } from '../tool.interface.js';
import { isPathProtected } from '../../workspace/protected-paths.js';
import { workspaceService } from '../../workspace/workspace.service.js';
import { generateId } from '../../../utils/ids.js';
import { getTimestamp } from '../../../utils/time.js';

const SearchWorkspaceInputSchema = z.object({
  query: z.string().min(1, 'Search query cannot be empty'),
  filePattern: z.string().optional(),
  maxResults: z.number().int().positive().optional().default(30),
});

interface SearchMatch {
  file: string;
  line?: number;
  preview?: string;
  type: 'content' | 'filename';
}

export class SearchWorkspaceTool implements Tool {
  readonly name = 'search_workspace';
  readonly description = 'Search repository filenames and contents within approved workspace';
  readonly requiredPermissions = ['file:read'];

  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const parseRes = SearchWorkspaceInputSchema.safeParse(input);
    if (!parseRes.success) {
      return {
        ok: false,
        error: `Invalid input for ${this.name}: ${parseRes.error.errors.map((e) => e.message).join('; ')}`,
      };
    }

    const { query, filePattern, maxResults } = parseRes.data;
    const wsRoot = context.workspaceRoot || workspaceService.getActiveWorkspace().absoluteRoot;

    if (!existsSync(wsRoot)) {
      return { ok: false, error: `Workspace root does not exist: "${wsRoot}"` };
    }

    const lowerQuery = query.toLowerCase();
    const matches: SearchMatch[] = [];

    const walk = (currentDir: string) => {
      if (matches.length >= maxResults) return;

      let entries: string[];
      try {
        entries = readdirSync(currentDir);
      } catch {
        return;
      }

      for (const entry of entries) {
        if (matches.length >= maxResults) break;

        const fullPath = join(currentDir, entry);
        const relPath = relative(wsRoot, fullPath).replace(/\\/g, '/');

        // Skip protected paths
        if (isPathProtected(relPath)) {
          continue;
        }

        let stat;
        try {
          stat = lstatSync(fullPath);
        } catch {
          continue;
        }

        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (stat.isFile()) {
          // If filePattern specified, check if file matches
          if (filePattern && !entry.toLowerCase().includes(filePattern.toLowerCase())) {
            continue;
          }

          // Filename match
          if (entry.toLowerCase().includes(lowerQuery)) {
            matches.push({
              file: relPath,
              type: 'filename',
            });
          }

          // Content match (skip files larger than 1MB or likely binary)
          if (stat.size > 0 && stat.size <= 1024 * 1024) {
            try {
              const content = readFileSync(fullPath, 'utf8');
              const lines = content.split('\n');
              for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
                if (matches.length >= maxResults) break;
                const line = lines[lineIdx];
                if (line.toLowerCase().includes(lowerQuery)) {
                  matches.push({
                    file: relPath,
                    line: lineIdx + 1,
                    preview: line.trim().slice(0, 160),
                    type: 'content',
                  });
                }
              }
            } catch {
              // Ignore read errors for binary or locked files
            }
          }
        }
      }
    };

    walk(wsRoot);

    await context.eventBus.publish({
      eventId: generateId('evt'),
      taskId: context.taskId,
      nodeId: context.nodeId,
      type: 'file_searched',
      timestamp: getTimestamp(),
      actorType: 'agent',
      actorId: context.actorId,
      correlationId: context.correlationId,
      payload: {
        query,
        matchCount: matches.length,
        matches: matches.map((m) => m.file),
      },
    });

    return {
      ok: true,
      data: {
        query,
        count: matches.length,
        matches,
      },
    };
  }
}
