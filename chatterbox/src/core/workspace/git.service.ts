import { spawn, spawnSync } from 'child_process';
import { existsSync, mkdirSync, cpSync, rmSync, realpathSync } from 'fs';
import * as fs from 'fs';
import { resolve, join, relative, isAbsolute } from 'path';
import { isPathProtected } from './protected-paths.js';

export interface GitInfo {
  isGitRepo: boolean;
  branch?: string;
  headCommit?: string;
  isClean?: boolean;
}

export interface WorktreeEntry {
  path: string;
  head?: string;
  branch?: string;
}

/**
 * Validates that a worktree path is strictly managed within Chatterbox-approved worktree roots
 * and is not the user's root workspace, a protected path, or a symlink escape.
 */
export function assertIsChatterboxManagedWorktree(
  workspaceRoot: string,
  worktreePath: string
): void {
  const normWorkspace = resolve(workspaceRoot);
  const normWorktree = resolve(worktreePath);

  // 1. Refuse to delete the user's original workspace root
  if (normWorktree.toLowerCase() === normWorkspace.toLowerCase()) {
    throw new Error(`Refusing to remove workspace root: ${normWorktree}`);
  }

  // 2. Approved Chatterbox-managed worktree directory roots
  const approvedRoots = [
    resolve(normWorkspace, '.chatterbox', 'worktrees'),
    resolve(normWorkspace, '.agentfeed', 'worktrees'),
    resolve(normWorkspace, 'worktrees'),
  ];

  const matchedRoot = approvedRoots.find((root) => {
    const rel = relative(root, normWorktree);
    return !rel.startsWith('..') && !isAbsolute(rel) && rel !== '';
  });

  if (!matchedRoot) {
    throw new Error(
      `Refusing to remove worktree outside Chatterbox-managed worktree directories: ${normWorktree}`
    );
  }

  // 3. Protected path check
  const relFromWorkspace = relative(normWorkspace, normWorktree);
  if (isPathProtected(relFromWorkspace)) {
    throw new Error(
      `Refusing to remove worktree matching protected path pattern: ${normWorktree}`
    );
  }

  // 4. Symlink / Junction escape check
  if (existsSync(normWorktree)) {
    try {
      const realTarget = realpathSync(normWorktree);
      const isTargetUnderApproved = approvedRoots.some((root) => {
        const rel = relative(root, realTarget);
        return !rel.startsWith('..') && !isAbsolute(rel);
      });

      if (!isTargetUnderApproved) {
        throw new Error(
          `Refusing to remove worktree resolving outside approved worktree directory (symlink escape): ${realTarget}`
        );
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('Refusing to remove')) {
        throw err;
      }
    }
  }
}

/**
 * Safely removes Windows directory junctions and symlinks before recursive deletion.
 * On Windows, recursive deletion can follow junctions into real targets.
 * This unlinks the junction itself without recursing into or modifying its target.
 */
export async function safelyUnlinkJunctions(targetDir: string): Promise<void> {
  if (!existsSync(targetDir)) {
    return;
  }

  try {
    const rootStat = await fs.promises.lstat(targetDir);
    if (rootStat.isSymbolicLink()) {
      try {
        await fs.promises.unlink(targetDir);
      } catch {
        await fs.promises.rmdir(targetDir);
      }
      return;
    }
  } catch {
    return;
  }

  async function traverse(currentDir: string): Promise<void> {
    let entries: fs.Dirent[] = [];
    try {
      entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      try {
        const stat = await fs.promises.lstat(fullPath);
        if (stat.isSymbolicLink()) {
          try {
            await fs.promises.unlink(fullPath);
          } catch {
            await fs.promises.rmdir(fullPath);
          }
        } else if (stat.isDirectory()) {
          await traverse(fullPath);
        }
      } catch {
        // Continue cleaning other entries
      }
    }
  }

  await traverse(targetDir);
}

export class GitService {
  /**
   * Helper to run git commands asynchronously with output capture.
   */
  private runGit(
    cwd: string,
    args: string[]
  ): Promise<{ status: number | null; stdout: string; stderr: string }> {
    return new Promise((res) => {
      const proc = spawn('git', args, {
        cwd,
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => {
        stdout += d.toString();
      });

      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      proc.on('close', (status) => {
        res({ status, stdout, stderr });
      });

      proc.on('error', (err) => {
        res({ status: 1, stdout, stderr: err.message });
      });
    });
  }

  /**
   * Probes workspace to determine if it is a valid Git repository.
   */
  probeGit(workspaceRoot: string): GitInfo {
    try {
      const isInside = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: workspaceRoot,
        encoding: 'utf8',
        windowsHide: true,
      });

      if (isInside.status !== 0 || isInside.stdout.trim() !== 'true') {
        return { isGitRepo: false };
      }

      const branchRes = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: workspaceRoot,
        encoding: 'utf8',
        windowsHide: true,
      });

      const headRes = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: workspaceRoot,
        encoding: 'utf8',
        windowsHide: true,
      });

      const statusRes = spawnSync('git', ['status', '--porcelain'], {
        cwd: workspaceRoot,
        encoding: 'utf8',
        windowsHide: true,
      });

      const branch = branchRes.stdout.trim() || 'unknown';
      const headCommit = headRes.stdout.trim() || 'unknown';
      const isClean = statusRes.stdout.trim().length === 0;

      return {
        isGitRepo: true,
        branch,
        headCommit,
        isClean,
      };
    } catch {
      return { isGitRepo: false };
    }
  }

  /**
   * Creates a task worktree for an approved task under Chatterbox worktree storage.
   */
  createTaskWorktree(
    workspaceRoot: string,
    taskId: string,
    storageDir?: string
  ): { worktreePath: string } {
    const targetStorage = storageDir || resolve(workspaceRoot, '.chatterbox');
    const res = this.prepareTaskWorkspace(workspaceRoot, targetStorage, taskId);
    return { worktreePath: res.targetDir };
  }

  /**
   * Lists all Git worktrees registered in the repository.
   */
  async listWorktrees(workspaceRoot: string): Promise<WorktreeEntry[]> {
    const res = await this.runGit(workspaceRoot, ['worktree', 'list', '--porcelain']);
    if (res.status !== 0) {
      return [];
    }

    const worktrees: WorktreeEntry[] = [];
    const lines = res.stdout.split(/\r?\n/);
    let current: WorktreeEntry | null = null;

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        if (current) {
          worktrees.push(current);
        }
        current = { path: resolve(line.substring('worktree '.length).trim()) };
      } else if (line.startsWith('HEAD ') && current) {
        current.head = line.substring('HEAD '.length).trim();
      } else if (line.startsWith('branch ') && current) {
        current.branch = line.substring('branch '.length).trim();
      } else if (line.trim() === '' && current) {
        worktrees.push(current);
        current = null;
      }
    }

    if (current) {
      worktrees.push(current);
    }

    return worktrees;
  }

  /**
   * Prepares a task isolation directory:
   * Uses git worktree if git repo is clean and supported, or creates a snapshot backup.
   */
  prepareTaskWorkspace(
    workspaceRoot: string,
    storageDir: string,
    taskId: string
  ): { targetDir: string; mode: 'worktree' | 'snapshot'; warning?: string } {
    const gitInfo = this.probeGit(workspaceRoot);

    if (gitInfo.isGitRepo) {
      const worktreesDir = resolve(storageDir, 'worktrees');
      const taskWorktree = resolve(worktreesDir, taskId);

      try {
        mkdirSync(worktreesDir, { recursive: true });
        if (!existsSync(taskWorktree)) {
          const res = spawnSync('git', ['worktree', 'add', '--detach', taskWorktree, 'HEAD'], {
            cwd: workspaceRoot,
            encoding: 'utf8',
            windowsHide: true,
          });

          if (res.status === 0 && existsSync(taskWorktree)) {
            return {
              targetDir: taskWorktree,
              mode: 'worktree',
            };
          }
        } else {
          return {
            targetDir: taskWorktree,
            mode: 'worktree',
          };
        }
      } catch {
        // Fallback to snapshot if worktree creation failed (e.g. detached HEAD or bare repo)
      }
    }

    // Snapshot fallback
    const snapshotsDir = resolve(storageDir, 'snapshots');
    const taskSnapshot = resolve(snapshotsDir, taskId);
    mkdirSync(taskSnapshot, { recursive: true });

    return {
      targetDir: workspaceRoot,
      mode: 'snapshot',
      warning: gitInfo.isGitRepo
        ? undefined
        : 'Workspace is not a Git repository. Git worktree recovery is unavailable; using file snapshots.',
    };
  }

  /**
   * Generates a diff against the original HEAD commit.
   */
  getDiffAgainstHead(worktreeOrRepoDir: string): string {
    try {
      const res = spawnSync('git', ['diff', 'HEAD'], {
        cwd: worktreeOrRepoDir,
        encoding: 'utf8',
        windowsHide: true,
      });
      if (res.status === 0) {
        return res.stdout;
      }
    } catch {
      // fallback
    }
    return '';
  }

  /**
   * Deterministically and safely removes an isolated Chatterbox task worktree.
   * Awaits all cleanup steps, unlinks Windows junctions safely, and prunes git metadata.
   */
  async removeTaskWorktree(workspaceRoot: string, worktreePath: string): Promise<boolean> {
    const absoluteWorktreePath = resolve(workspaceRoot, worktreePath);

    // Guard: Verify path is inside Chatterbox-managed worktree directory
    assertIsChatterboxManagedWorktree(workspaceRoot, absoluteWorktreePath);

    // 1. Inspect and unlink junctions/symlinks safely first
    if (existsSync(absoluteWorktreePath)) {
      await safelyUnlinkJunctions(absoluteWorktreePath);
    }

    // 2. Ask Git to remove the registered worktree
    await this.runGit(workspaceRoot, ['worktree', 'remove', '--force', absoluteWorktreePath]);

    // 3. If Git left the directory behind, remove it safely with retry
    if (existsSync(absoluteWorktreePath)) {
      try {
        await fs.promises.rm(absoluteWorktreePath, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 100,
        });
      } catch {
        if (existsSync(absoluteWorktreePath)) {
          rmSync(absoluteWorktreePath, {
            recursive: true,
            force: true,
            maxRetries: 3,
            retryDelay: 100,
          });
        }
      }
    }

    // 4. Remove stale Git worktree metadata
    await this.runGit(workspaceRoot, ['worktree', 'prune']);

    // 5. Verify removal
    if (existsSync(absoluteWorktreePath)) {
      throw new Error(`Failed to remove worktree: ${absoluteWorktreePath}`);
    }

    return true;
  }

  /**
   * Creates a snapshot backup of files in non-git workspace.
   */
  createSnapshotBackup(workspaceRoot: string, snapshotDir: string): void {
    try {
      mkdirSync(snapshotDir, { recursive: true });
      cpSync(workspaceRoot, snapshotDir, {
        recursive: true,
        filter: (src) => {
          const lower = src.toLowerCase();
          return !lower.includes('node_modules') && !lower.includes('.git') && !lower.includes('.env');
        },
      });
    } catch {
      // ignore snapshot copy errors
    }
  }
}

export const gitService = new GitService();
