import { existsSync, lstatSync, realpathSync } from 'fs';
import { resolve } from 'path';
import { pathGuard, WorkspaceSecurityError } from './path-guard.js';
import { DEFAULT_PROTECTED_PATH_STRINGS } from './protected-paths.js';

export type WorkspaceMode = 'read-only' | 'workspace-write' | 'supervised';

export type WorkspaceConfig = {
  root: string;
  mode: WorkspaceMode;
  protectedPaths: string[];
  allowedCommands: string[];
};

export type ResolvedWorkspace = {
  root: string;
  absoluteRoot: string;
  mode: WorkspaceMode;
};

export const DEFAULT_ALLOWED_COMMANDS = [
  'npm test',
  'pnpm test',
  'npm run lint',
  'pnpm lint',
  'npm run typecheck',
  'pnpm typecheck',
  'git status',
  'git diff',
];

export class WorkspaceService {
  private activeWorkspace: ResolvedWorkspace | null = null;
  private allowedCommands: string[] = [...DEFAULT_ALLOWED_COMMANDS];
  private customProtectedPaths: string[] = [...DEFAULT_PROTECTED_PATH_STRINGS];

  /**
   * Resolves and canonicalizes the workspace path at startup.
   * Rejects non-existent paths or paths that are not directories.
   */
  async resolve(input: {
    workspace?: string;
    mode?: WorkspaceMode;
    allowedCommands?: string[];
    protectedPaths?: string[];
  }): Promise<ResolvedWorkspace> {
    const rawRoot = input.workspace || process.cwd();
    const resolvedPath = resolve(rawRoot);

    if (!existsSync(resolvedPath)) {
      throw new WorkspaceSecurityError(
        `Workspace directory does not exist: "${rawRoot}". Specify an existing directory with --workspace.`,
        'INVALID_PATH'
      );
    }

    const stat = lstatSync(resolvedPath);
    if (!stat.isDirectory()) {
      throw new WorkspaceSecurityError(
        `Workspace path is not a directory: "${rawRoot}".`,
        'INVALID_PATH'
      );
    }

    let absoluteRoot: string;
    try {
      absoluteRoot = realpathSync(resolvedPath);
    } catch (err: unknown) {
      throw new WorkspaceSecurityError(
        `Failed to resolve realpath for workspace "${rawRoot}": ${err instanceof Error ? err.message : String(err)}`,
        'INVALID_PATH'
      );
    }

    // Default to 'supervised' mode for security unless explicitly set
    const mode: WorkspaceMode = input.mode || 'supervised';

    if (input.allowedCommands) {
      this.allowedCommands = [...input.allowedCommands];
    }
    if (input.protectedPaths) {
      this.customProtectedPaths = [...input.protectedPaths];
    }

    this.activeWorkspace = {
      root: resolvedPath,
      absoluteRoot,
      mode,
    };

    return this.activeWorkspace;
  }

  getActiveWorkspace(): ResolvedWorkspace {
    if (!this.activeWorkspace) {
      const root = process.cwd();
      this.activeWorkspace = {
        root,
        absoluteRoot: realpathSync(root),
        mode: 'supervised',
      };
    }
    return this.activeWorkspace;
  }

  getAllowedCommands(): string[] {
    return [...this.allowedCommands];
  }

  getProtectedPaths(): string[] {
    return [...this.customProtectedPaths];
  }

  isCommandAllowed(command: string): boolean {
    const trimmed = command.trim();
    return this.allowedCommands.some((allowed) => {
      return trimmed === allowed || trimmed.startsWith(allowed + ' ');
    });
  }

  setMode(mode: WorkspaceMode): void {
    if (this.activeWorkspace) {
      this.activeWorkspace.mode = mode;
    }
  }

  reset(): void {
    this.activeWorkspace = null;
    this.allowedCommands = [...DEFAULT_ALLOWED_COMMANDS];
    this.customProtectedPaths = [...DEFAULT_PROTECTED_PATH_STRINGS];
  }

  async assertSafePath(targetPath: string, allowProtected = false): Promise<string> {
    const ws = this.getActiveWorkspace();
    return await pathGuard.assertInsideWorkspace({
      workspaceRoot: ws.absoluteRoot,
      targetPath,
      customProtected: this.customProtectedPaths,
      allowProtected,
    });
  }
}

export const workspaceService = new WorkspaceService();
