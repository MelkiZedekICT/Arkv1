import { z } from 'zod';
import { Tool, ToolContext, ToolResult } from '../tool.interface.js';
import { commandRunner } from '../../workspace/command-runner.js';
import { workspaceService } from '../../workspace/workspace.service.js';

const RunCommandInputSchema = z.object({
  command: z.string().min(1, 'command cannot be empty'),
  timeoutMs: z.number().int().positive().optional().default(60000),
});

export class RunCommandTool implements Tool {
  readonly name = 'run_command';
  readonly description = 'Execute an allowlisted project command (tests, linting, typechecking, git status) within approved workspace';
  readonly requiredPermissions = ['shell:execute'];

  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const parseRes = RunCommandInputSchema.safeParse(input);
    if (!parseRes.success) {
      return {
        ok: false,
        error: `Invalid input for ${this.name}: ${parseRes.error.errors.map((e) => e.message).join('; ')}`,
      };
    }

    const { command, timeoutMs } = parseRes.data;
    const wsRoot = context.workspaceRoot || workspaceService.getActiveWorkspace().absoluteRoot;

    const result = await commandRunner.run({
      command,
      cwd: wsRoot,
      taskId: context.taskId,
      nodeId: context.nodeId,
      actorId: context.actorId,
      correlationId: context.correlationId,
      eventBus: context.eventBus,
      timeoutMs,
      allowedCommands: workspaceService.getAllowedCommands(),
    });

    return {
      ok: result.ok,
      data: {
        command: result.command,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: result.durationMs,
        truncated: result.truncated,
      },
      error: result.error,
    };
  }
}
