import { spawn } from 'child_process';
import { EventBus } from '../events/event-bus.js';
import { generateId } from '../../utils/ids.js';
import { getTimestamp } from '../../utils/time.js';
import { sanitizeErrorMessage } from '../../utils/security.js';

export interface CommandRunOptions {
  command: string;
  cwd: string;
  taskId: string;
  nodeId?: string;
  actorId: string;
  correlationId: string;
  eventBus: EventBus;
  timeoutMs?: number;
  maxOutputBytes?: number;
  allowedCommands?: string[];
}

export class CommandSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandSecurityError';
  }
}

export interface CommandRunResult {
  ok: boolean;
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  truncated: boolean;
  error?: string;
}

const DEFAULT_ALLOWED = [
  'npm test',
  'pnpm test',
  'npm run lint',
  'pnpm lint',
  'npm run typecheck',
  'pnpm typecheck',
  'git status',
  'git diff',
];

// Explicitly safe environment variables to inherit
const SAFE_ENV_VARS = [
  'PATH',
  'PATHEXT',
  'HOME',
  'HOMEPATH',
  'HOMEDRIVE',
  'USERPROFILE',
  'LANG',
  'SHELL',
  'TERM',
  'NODE_ENV',
  'TEMP',
  'TMP',
  'SYSTEMROOT',
  'COMSPEC',
  'APPDATA',
  'LOCALAPPDATA',
];

export class CommandRunner {
  private sanitizeEnvironment(): NodeJS.ProcessEnv {
    const cleanEnv: NodeJS.ProcessEnv = {};
    for (const key of Object.keys(process.env)) {
      const upper = key.toUpperCase();
      if (SAFE_ENV_VARS.includes(upper)) {
        cleanEnv[key] = process.env[key];
      }
    }
    cleanEnv.CI = '1';
    return cleanEnv;
  }

  isCommandAllowlisted(cmd: string, allowedList = DEFAULT_ALLOWED): boolean {
    const trimmed = cmd.trim();
    return allowedList.some((allowed) => {
      return trimmed === allowed || trimmed.startsWith(allowed + ' ');
    });
  }

  isAllowlisted(cmd: string, allowedList = DEFAULT_ALLOWED): boolean {
    return this.isCommandAllowlisted(cmd, allowedList);
  }

  async runCommand(
    cmd: string,
    options: { cwd: string; timeoutMs?: number; allowedCommands?: string[] }
  ): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
    if (!this.isAllowlisted(cmd, options.allowedCommands)) {
      throw new CommandSecurityError(`Command "${cmd}" is not allowlisted.`);
    }

    const res = await this.run({
      command: cmd,
      cwd: options.cwd,
      taskId: 'command_runner_task',
      actorId: 'command_runner',
      correlationId: 'corr_cmd',
      eventBus: new EventBus(),
      timeoutMs: options.timeoutMs,
      allowedCommands: options.allowedCommands,
    });

    if (!res.ok) {
      if (res.error?.includes('timed out')) {
        throw new Error(res.error);
      }
      if (res.error?.includes('not in the approved allowlist') || res.error?.includes('is not allowlisted')) {
        throw new CommandSecurityError(res.error);
      }
    }

    return {
      exitCode: res.exitCode,
      stdout: res.stdout,
      stderr: res.stderr,
    };
  }

  async run(options: CommandRunOptions): Promise<CommandRunResult> {
    const {
      command,
      cwd,
      taskId,
      nodeId,
      actorId,
      correlationId,
      eventBus,
      timeoutMs = 60000,
      maxOutputBytes = 100 * 1024,
      allowedCommands = DEFAULT_ALLOWED,
    } = options;

    const trimmedCommand = command.trim();

    // 1. Strict allowlist verification
    if (!this.isCommandAllowlisted(trimmedCommand, allowedCommands)) {
      const errMsg = `Command "${trimmedCommand}" is not in the approved allowlist. Allowed commands: ${allowedCommands.join(', ')}`;
      await eventBus.publish({
        eventId: generateId('evt'),
        taskId,
        nodeId,
        type: 'command_rejected',
        timestamp: getTimestamp(),
        actorType: 'system',
        actorId: 'command_guard',
        correlationId,
        payload: {
          command: trimmedCommand,
          reason: errMsg,
        },
      });

      return {
        ok: false,
        command: trimmedCommand,
        exitCode: 1,
        stdout: '',
        stderr: errMsg,
        durationMs: 0,
        truncated: false,
        error: errMsg,
      };
    }

    // 2. Publish command_started
    await eventBus.publish({
      eventId: generateId('evt'),
      taskId,
      nodeId,
      type: 'command_started',
      timestamp: getTimestamp(),
      actorType: 'agent',
      actorId,
      correlationId,
      payload: {
        command: trimmedCommand,
        cwd,
        nodeId,
      },
    });

    const startTime = Date.now();
    const env = this.sanitizeEnvironment();

    // Parse command tokens safely
    const tokens = trimmedCommand.split(/\s+/).filter(Boolean);
    const executable = tokens[0];
    const args = tokens.slice(1);

    return new Promise<CommandRunResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let truncated = false;
      let timedOut = false;

      // On Windows, use shell: true to avoid CVE-2024-27980 EINVAL when invoking npm/pnpm/git
      const isWindows = process.platform === 'win32';
      const proc = isWindows
        ? spawn(trimmedCommand, {
            cwd,
            env,
            shell: true,
            windowsHide: true,
          })
        : spawn(executable, args, {
            cwd,
            env,
            shell: false,
          });

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          proc.kill('SIGTERM');
        } catch {
          // ignore kill failure
        }
      }, timeoutMs);

      proc.stdout?.on('data', (chunk: Buffer) => {
        if (stdout.length + chunk.length > maxOutputBytes) {
          truncated = true;
          stdout += chunk.toString('utf8', 0, Math.max(0, maxOutputBytes - stdout.length));
        } else {
          stdout += chunk.toString('utf8');
        }
      });

      proc.stderr?.on('data', (chunk: Buffer) => {
        if (stderr.length + chunk.length > maxOutputBytes) {
          truncated = true;
          stderr += chunk.toString('utf8', 0, Math.max(0, maxOutputBytes - stderr.length));
        } else {
          stderr += chunk.toString('utf8');
        }
      });

      proc.on('error', async (err: Error) => {
        clearTimeout(timer);
        const durationMs = Math.max(1, Date.now() - startTime);
        const errMsg = sanitizeErrorMessage(err);

        await eventBus.publish({
          eventId: generateId('evt'),
          taskId,
          nodeId,
          type: 'command_failed',
          timestamp: getTimestamp(),
          actorType: 'agent',
          actorId,
          correlationId,
          payload: {
            command: trimmedCommand,
            error: errMsg,
            durationMs,
          },
        });

        resolve({
          ok: false,
          command: trimmedCommand,
          exitCode: 1,
          stdout,
          stderr: errMsg,
          durationMs,
          truncated,
          error: errMsg,
        });
      });

      proc.on('close', async (code: number | null) => {
        clearTimeout(timer);
        const durationMs = Math.max(1, Date.now() - startTime);
        const ok = code === 0 && !timedOut;

        if (timedOut) {
          stderr += `\nCommand timed out after ${timeoutMs}ms.`;
        }

        const eventType = ok ? 'command_completed' : 'command_failed';

        await eventBus.publish({
          eventId: generateId('evt'),
          taskId,
          nodeId,
          type: eventType,
          timestamp: getTimestamp(),
          actorType: 'agent',
          actorId,
          correlationId,
          payload: {
            command: trimmedCommand,
            exitCode: timedOut ? 124 : code,
            durationMs,
            stdoutSnippet: stdout.slice(0, 300),
            stderrSnippet: stderr.slice(0, 300),
            ok,
          },
        });

        resolve({
          ok,
          command: trimmedCommand,
          exitCode: timedOut ? 124 : code,
          stdout,
          stderr,
          durationMs,
          truncated,
          error: ok ? undefined : (timedOut ? 'Command timed out' : `Command failed with exit code ${code}`),
        });
      });
    });
  }
}

export const commandRunner = new CommandRunner();
