import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, cpSync, rmSync } from 'fs';
import { resolve } from 'path';

export interface GitInfo {
  isGitRepo: boolean;
  branch?: string;
  headCommit?: string;
  isClean?: boolean;
}

export class GitService {
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
   * Creates a task worktree for an approved task.
   */
  createTaskWorktree(workspaceRoot: string, taskId: string): { worktreePath: string } {
    const res = this.prepareTaskWorkspace(workspaceRoot, workspaceRoot, taskId);
    return { worktreePath: res.targetDir };
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
   * Cleans up an isolated worktree if requested.
   */
  removeTaskWorktree(workspaceRoot: string, worktreePath: string): boolean {
    try {
      const res = spawnSync('git', ['worktree', 'remove', '--force', worktreePath], {
        cwd: workspaceRoot,
        encoding: 'utf8',
        windowsHide: true,
      });
      if (existsSync(worktreePath)) {
        try {
          rmSync(worktreePath, { recursive: true, force: true });
        } catch {
          // Ignore secondary cleanup error
        }
      }
      return res.status === 0 || !existsSync(worktreePath);
    } catch {
      if (existsSync(worktreePath)) {
        try {
          rmSync(worktreePath, { recursive: true, force: true });
        } catch {
          // Ignore secondary cleanup error
        }
      }
      return !existsSync(worktreePath);
    }
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
