import { z } from 'zod';
import { existsSync, lstatSync, readFileSync, openSync, readSync, closeSync } from 'fs';
import { Tool, ToolContext, ToolResult } from '../tool.interface.js';
import { pathGuard } from '../../workspace/path-guard.js';
import { workspaceService } from '../../workspace/workspace.service.js';
import { generateId } from '../../../utils/ids.js';
import { getTimestamp } from '../../../utils/time.js';

const ReadFileInputSchema = z
  .object({
    filePath: z.string().optional(),
    path: z.string().optional(),
    maxBytes: z.number().int().positive().optional().default(512 * 1024),
  })
  .refine((data) => Boolean(data.filePath || data.path), {
    message: 'Either filePath or path must be provided',
  })
  .transform((data) => ({
    filePath: (data.filePath || data.path)!,
    maxBytes: data.maxBytes,
  }));

function isBinaryBuffer(buffer: Buffer): boolean {
  const checkLen = Math.min(buffer.length, 8000);
  for (let i = 0; i < checkLen; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

export class ReadFileTool implements Tool {
  readonly name = 'read_file';
  readonly description = 'Read the contents of a text file within the approved workspace';
  readonly requiredPermissions = ['file:read'];

  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const parseRes = ReadFileInputSchema.safeParse(input);
    if (!parseRes.success) {
      return {
        ok: false,
        error: `Invalid input for ${this.name}: ${parseRes.error.errors.map((e) => e.message).join('; ')}`,
      };
    }

    const { filePath, maxBytes } = parseRes.data;
    const wsRoot = context.workspaceRoot || workspaceService.getActiveWorkspace().absoluteRoot;

    let safePath: string;
    try {
      safePath = await pathGuard.assertInsideWorkspace({
        workspaceRoot: wsRoot,
        targetPath: filePath,
      });
    } catch (err: unknown) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    if (!existsSync(safePath)) {
      return {
        ok: false,
        error: `File not found: "${filePath}"`,
      };
    }

    const stat = lstatSync(safePath);
    if (!stat.isFile()) {
      return {
        ok: false,
        error: `Path is not a regular file: "${filePath}"`,
      };
    }

    if (stat.size > maxBytes) {
      return {
        ok: false,
        error: `File size (${stat.size} bytes) exceeds maximum limit (${maxBytes} bytes).`,
      };
    }

    // Binary check
    const fd = openSync(safePath, 'r');
    const probeBuf = Buffer.alloc(Math.min(stat.size, 8192));
    readSync(fd, probeBuf, 0, probeBuf.length, 0);
    closeSync(fd);

    if (isBinaryBuffer(probeBuf)) {
      return {
        ok: false,
        error: `Cannot read "${filePath}": binary file detected.`,
      };
    }

    const content = readFileSync(safePath, 'utf8');

    // Emit file_read event
    await context.eventBus.publish({
      eventId: generateId('evt'),
      taskId: context.taskId,
      nodeId: context.nodeId,
      type: 'file_read',
      timestamp: getTimestamp(),
      actorType: 'agent',
      actorId: context.actorId,
      correlationId: context.correlationId,
      payload: {
        filePath,
        bytes: stat.size,
        isBinary: false,
      },
    });

    return {
      ok: true,
      data: {
        filePath,
        content,
        bytes: stat.size,
        lineCount: content.split('\n').length,
      },
    };
  }
}
