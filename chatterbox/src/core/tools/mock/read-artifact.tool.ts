import { z } from 'zod';
import { Tool, ToolContext, ToolResult } from '../tool.interface.js';

const ReadArtifactInputSchema = z
  .object({
    artifactId: z.string().optional(),
    path: z.string().optional(),
  })
  .refine((data) => Boolean(data.artifactId || data.path), {
    message: 'Must provide either artifactId or path',
  });

export class ReadArtifactTool implements Tool {
  readonly name = 'read_artifact';
  readonly description = 'Reads the content of an upstream artifact created within the task';
  readonly requiredPermissions = ['artifact:read'];

  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const parseResult = ReadArtifactInputSchema.safeParse(input);
    if (!parseResult.success) {
      return {
        ok: false,
        error: `Invalid input for ${this.name}: ${parseResult.error.errors.map((e) => e.message).join('; ')}`,
      };
    }

    const { artifactId, path } = parseResult.data;

    try {
      if (artifactId) {
        const content = await context.artifactService.readArtifactContent(artifactId);
        const metadata = await context.artifactService.getArtifact(artifactId);
        return {
          ok: true,
          data: {
            artifactId,
            title: metadata?.title,
            type: metadata?.type,
            content,
          },
        };
      }

      if (path) {
        const content = await context.artifactService.readArtifactByPath(path, context.taskId);
        return {
          ok: true,
          data: {
            path,
            content,
          },
        };
      }

      return {
        ok: false,
        error: 'Neither artifactId nor path was provided.',
      };
    } catch (err) {
      return {
        ok: false,
        error: `Failed to read artifact: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
