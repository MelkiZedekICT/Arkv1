import { z } from 'zod';
import { Tool, ToolContext, ToolResult } from '../tool.interface.js';

const CreateMarkdownArtifactInputSchema = z.object({
  title: z.string().min(1, 'Artifact title cannot be empty'),
  content: z.string().min(1, 'Artifact content cannot be empty'),
  filename: z.string().optional(),
});

export class CreateMarkdownArtifactTool implements Tool {
  readonly name = 'create_markdown_artifact';
  readonly description = 'Creates and records a Markdown artifact within the task directory';
  readonly requiredPermissions = ['artifact:create'];

  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const parseResult = CreateMarkdownArtifactInputSchema.safeParse(input);
    if (!parseResult.success) {
      return {
        ok: false,
        error: `Invalid input for ${this.name}: ${parseResult.error.errors.map((e) => e.message).join('; ')}`,
      };
    }

    const { title, content, filename } = parseResult.data;

    try {
      const artifact = await context.artifactService.createArtifact({
        taskId: context.taskId,
        nodeId: context.nodeId,
        authorId: context.actorId,
        type: 'markdown',
        title,
        content,
        filename,
        correlationId: context.correlationId,
      });

      return {
        ok: true,
        data: {
          artifactId: artifact.id,
          title: artifact.title,
          path: artifact.path,
          type: artifact.type,
        },
      };
    } catch (err) {
      return {
        ok: false,
        error: `Failed to create markdown artifact: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
