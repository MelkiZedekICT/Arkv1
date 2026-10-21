import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, renameSync } from 'fs';
import { dirname, resolve } from 'path';
import { randomBytes } from 'crypto';
import {
  ProposedChangeset,
  ProposedFileOperation,
  UnifiedDiff,
} from '../agents/schemas/coding-schemas.js';

import { AgentRole } from '../models/enums.js';
import { PathGuard, PathGuardError } from './path-guard.js';
import { DiffService, diffService } from './diff.service.js';
import { ChangesetRepository } from '../storage/repositories/changeset.repository.js';
import { EventBus } from '../events/event-bus.js';
import { workspaceService } from './workspace.service.js';
import { resolveStorageDir } from '../config/config.js';
import { generateId } from '../../utils/ids.js';
import { getTimestamp } from '../../utils/time.js';

export interface AppliedChangesetResult {
  success: boolean;
  changeset: ProposedChangeset;
  appliedFiles: string[];
  error?: string;
}

export interface StaleCheckResult {
  isStale: boolean;
  staleFiles: string[];
  details?: Record<string, { expected: string | null; actual: string | null }>;
}

export interface ChangesetService {
  propose(input: {
    taskId: string;
    nodeId: string;
    agentRole: AgentRole;
    operations: ProposedFileOperation[];
    summary: string;
  }): Promise<ProposedChangeset>;

  getById(changesetId: string): Promise<ProposedChangeset | null>;

  listByTask(taskId: string): Promise<ProposedChangeset[]>;

  approve(input: {
    changesetId: string;
    approverId: string;
  }): Promise<ProposedChangeset>;

  reject(input: {
    changesetId: string;
    rejectedById: string;
    reason?: string;
  }): Promise<ProposedChangeset>;

  apply(input: {
    changesetId: string;
    approvedById: string;
  }): Promise<AppliedChangesetResult>;

  checkStale(changesetId: string): Promise<StaleCheckResult>;
}

export interface ChangesetServiceOptions {
  changesetRepo?: ChangesetRepository;
  eventBus?: EventBus;
  workspaceRoot?: string;
  diffService?: DiffService;
}

export class DefaultChangesetService implements ChangesetService {
  private changesetRepo?: ChangesetRepository;
  private eventBus?: EventBus;
  private workspaceRoot?: string;
  private diff: DiffService;
  private inMemoryStore = new Map<string, ProposedChangeset>();

  constructor(options?: ChangesetServiceOptions) {
    this.changesetRepo = options?.changesetRepo;
    this.eventBus = options?.eventBus;
    this.workspaceRoot = options?.workspaceRoot;
    this.diff = options?.diffService ?? diffService;
  }

  setRepository(repo: ChangesetRepository): void {
    this.changesetRepo = repo;
  }

  setEventBus(bus: EventBus): void {
    this.eventBus = bus;
  }

  setWorkspaceRoot(root: string): void {
    this.workspaceRoot = root;
  }

  private getEffectiveWorkspaceRoot(): string {
    if (this.workspaceRoot) {
      return this.workspaceRoot;
    }
    try {
      return workspaceService.getActiveWorkspace().absoluteRoot;
    } catch {
      return process.cwd();
    }
  }

  /**
   * Proposes a new multi-file changeset.
   * - Validates every path through PathGuard.
   * - Rejects protected paths.
   * - Generates unified diffs and records proposal-time SHA-256 hashes.
   * - Does NOT modify workspace files.
   */
  async propose(input: {
    taskId: string;
    nodeId: string;
    agentRole: AgentRole;
    operations: ProposedFileOperation[];
    summary: string;
  }): Promise<ProposedChangeset> {
    const wsRoot = this.getEffectiveWorkspaceRoot();
    const diffs: UnifiedDiff[] = [];
    const fileHashes: Record<string, string> = {};
    let totalAdditions = 0;
    let totalDeletions = 0;

    // 1. Validate every path through PathGuard and ensure no protected paths
    for (const op of input.operations) {
      const cleanPath = op.path.replace(/\\/g, '/');
      // Throws PathGuardError if path escapes workspace or touches protected files
      const safeAbsPath = PathGuard.resolveSafe(wsRoot, cleanPath, { allowProtected: false });

      if (op.operation === 'create_folder') {
        continue;
      }

      const fileExists = existsSync(safeAbsPath);
      let originalContent: string | null = null;
      let originalSha256: string | undefined = undefined;

      if (fileExists) {
        const buffer = readFileSync(safeAbsPath);
        if (this.diff.isBinaryBuffer(buffer)) {
          throw new PathGuardError(
            `Cannot generate diff for binary file: "${cleanPath}"`,
            'INVALID_PATH'
          );
        }
        originalContent = buffer.toString('utf8');
        originalSha256 = this.diff.computeSha256(originalContent);
        fileHashes[cleanPath] = originalSha256;
      }

      let newContent: string | null = null;
      let changeType: 'create' | 'edit' | 'delete' = 'create';

      if (op.operation === 'create_file') {
        newContent = op.content;
        changeType = 'create';
      } else if (op.operation === 'delete_file') {
        newContent = null;
        changeType = 'delete';
      } else if (op.operation === 'edit_file') {
        changeType = 'edit';
        if (op.newContent !== undefined) {
          newContent = op.newContent;
        } else if (op.search && op.replace !== undefined && originalContent !== null) {
          newContent = originalContent.replace(op.search, op.replace);
        } else {
          newContent = originalContent ?? '';
        }
      }

      const diffResult = this.diff.generateDiff(cleanPath, originalContent, newContent, originalSha256);
      totalAdditions += diffResult.additions;
      totalDeletions += diffResult.deletions;

      diffs.push({
        filePath: diffResult.filePath,
        changeType,
        oldContent: diffResult.oldContent,
        newContent: diffResult.newContent,
        unifiedDiff: diffResult.unifiedDiff,
        additions: diffResult.additions,
        deletions: diffResult.deletions,
        originalSha256,
      });
    }

    const now = getTimestamp();
    const changesetId = generateId('cset');

    const changeset: ProposedChangeset = {
      id: changesetId,
      taskId: input.taskId,
      nodeId: input.nodeId,
      agentRole: input.agentRole,
      operations: input.operations,
      diffs,
      fileHashes,
      status: 'proposed',
      summary: input.summary,
      additions: totalAdditions,
      deletions: totalDeletions,
      createdAt: now,
      updatedAt: now,
    };

    // Store in memory
    this.inMemoryStore.set(changeset.id, changeset);

    // Persist to SQLite if repository available
    if (this.changesetRepo) {
      try {
        await this.changesetRepo.create(changeset);
      } catch {
        // Fallback or ignore if table not initialized in memory mode
      }
    }

    // Publish events
    if (this.eventBus) {
      await this.eventBus.publish({
        eventId: generateId('evt'),
        taskId: input.taskId,
        nodeId: input.nodeId,
        type: 'changeset_proposed',
        timestamp: now,
        actorType: 'agent',
        actorId: `agent_${input.agentRole}`,
        correlationId: generateId('corr'),
        payload: {
          changesetId: changeset.id,
          filesCount: changeset.diffs.length,
          additions: changeset.additions,
          deletions: changeset.deletions,
          summary: changeset.summary,
          operations: changeset.operations as unknown as Array<Record<string, unknown>>,
          diffs: changeset.diffs as unknown as Array<Record<string, unknown>>,
        },
      });

      for (const d of changeset.diffs) {
        await this.eventBus.publish({
          eventId: generateId('evt'),
          taskId: input.taskId,
          nodeId: input.nodeId,
          type: 'diff_proposed',
          timestamp: now,
          actorType: 'agent',
          actorId: `agent_${input.agentRole}`,
          correlationId: generateId('corr'),
          payload: {
            filePath: d.filePath,
            changeType: d.changeType,
            additions: d.additions,
            deletions: d.deletions,
            diffSnippet: d.unifiedDiff.slice(0, 1000),
          },
        });
      }
    }

    return changeset;
  }

  async getById(changesetId: string): Promise<ProposedChangeset | null> {
    if (this.changesetRepo) {
      try {
        const persisted = await this.changesetRepo.getById(changesetId);
        if (persisted) {
          this.inMemoryStore.set(persisted.id, persisted);
          return persisted;
        }
      } catch {
        // fallback to in-memory
      }
    }
    return this.inMemoryStore.get(changesetId) ?? null;
  }

  async listByTask(taskId: string): Promise<ProposedChangeset[]> {
    if (this.changesetRepo) {
      try {
        return await this.changesetRepo.listByTaskId(taskId);
      } catch {
        // fallback to in-memory
      }
    }
    return Array.from(this.inMemoryStore.values()).filter((c) => c.taskId === taskId);
  }

  async approve(input: { changesetId: string; approverId: string }): Promise<ProposedChangeset> {
    const changeset = await this.getById(input.changesetId);
    if (!changeset) {
      throw new Error(`Changeset not found: "${input.changesetId}"`);
    }

    const now = getTimestamp();
    changeset.status = 'approved';
    changeset.approvedBy = input.approverId;
    changeset.approvedAt = now;
    changeset.updatedAt = now;

    this.inMemoryStore.set(changeset.id, changeset);
    if (this.changesetRepo) {
      try {
        await this.changesetRepo.update(changeset);
      } catch {
        // ignore
      }
    }

    if (this.eventBus) {
      await this.eventBus.publish({
        eventId: generateId('evt'),
        taskId: changeset.taskId,
        nodeId: changeset.nodeId,
        type: 'changeset_approved',
        timestamp: now,
        actorType: 'user',
        actorId: input.approverId,
        correlationId: generateId('corr'),
        payload: {
          changesetId: changeset.id,
          approvedBy: input.approverId,
        },
      });

      for (const d of changeset.diffs) {
        await this.eventBus.publish({
          eventId: generateId('evt'),
          taskId: changeset.taskId,
          nodeId: changeset.nodeId,
          type: 'diff_approved',
          timestamp: now,
          actorType: 'user',
          actorId: input.approverId,
          correlationId: generateId('corr'),
          payload: {
            filePath: d.filePath,
            changeType: d.changeType,
            approvedBy: input.approverId,
          },
        });
      }
    }

    return changeset;
  }

  async reject(input: {
    changesetId: string;
    rejectedById: string;
    reason?: string;
  }): Promise<ProposedChangeset> {
    const changeset = await this.getById(input.changesetId);
    if (!changeset) {
      throw new Error(`Changeset not found: "${input.changesetId}"`);
    }

    const now = getTimestamp();
    changeset.status = 'rejected';
    changeset.rejectedBy = input.rejectedById;
    changeset.rejectedAt = now;
    changeset.failureReason = input.reason;
    changeset.updatedAt = now;

    this.inMemoryStore.set(changeset.id, changeset);
    if (this.changesetRepo) {
      try {
        await this.changesetRepo.update(changeset);
      } catch {
        // ignore
      }
    }

    if (this.eventBus) {
      await this.eventBus.publish({
        eventId: generateId('evt'),
        taskId: changeset.taskId,
        nodeId: changeset.nodeId,
        type: 'changeset_rejected',
        timestamp: now,
        actorType: 'user',
        actorId: input.rejectedById,
        correlationId: generateId('corr'),
        payload: {
          changesetId: changeset.id,
          rejectedBy: input.rejectedById,
          reason: input.reason,
        },
      });

      for (const d of changeset.diffs) {
        await this.eventBus.publish({
          eventId: generateId('evt'),
          taskId: changeset.taskId,
          nodeId: changeset.nodeId,
          type: 'diff_rejected',
          timestamp: now,
          actorType: 'user',
          actorId: input.rejectedById,
          correlationId: generateId('corr'),
          payload: {
            filePath: d.filePath,
            changeType: d.changeType,
            rejectedBy: input.rejectedById,
            reason: input.reason,
          },
        });
      }
    }

    return changeset;
  }

  /**
   * Rechecks every file hash and staleness condition against current disk state.
   */
  async checkStale(changesetId: string): Promise<StaleCheckResult> {
    const changeset = await this.getById(changesetId);
    if (!changeset) {
      throw new Error(`Changeset not found: "${changesetId}"`);
    }

    const wsRoot = this.getEffectiveWorkspaceRoot();
    const staleResult = this.diff.isChangesetStale(wsRoot, changeset);

    if (staleResult.isStale) {
      changeset.status = 'stale';
      changeset.updatedAt = getTimestamp();
      this.inMemoryStore.set(changeset.id, changeset);
      if (this.changesetRepo) {
        try {
          await this.changesetRepo.update(changeset);
        } catch {
          // ignore
        }
      }

      if (this.eventBus) {
        const now = getTimestamp();
        await this.eventBus.publish({
          eventId: generateId('evt'),
          taskId: changeset.taskId,
          nodeId: changeset.nodeId,
          type: 'changeset_stale',
          timestamp: now,
          actorType: 'system',
          actorId: 'stale_detector',
          correlationId: generateId('corr'),
          payload: {
            changesetId: changeset.id,
            staleFiles: staleResult.staleFiles,
            reason: `Files modified after proposal: ${staleResult.staleFiles.join(', ')}`,
          },
        });

        for (const file of staleResult.staleFiles) {
          const detail = staleResult.details[file];
          await this.eventBus.publish({
            eventId: generateId('evt'),
            taskId: changeset.taskId,
            nodeId: changeset.nodeId,
            type: 'diff_stale',
            timestamp: now,
            actorType: 'system',
            actorId: 'stale_detector',
            correlationId: generateId('corr'),
            payload: {
              changesetId: changeset.id,
              filePath: file,
              expectedHash: detail?.expected ?? undefined,
              actualHash: detail?.actual ?? null,
              reason: `File "${file}" changed on disk after proposal`,
            },
          });
        }
      }
    }

    return staleResult;
  }

  /**
   * Applies an approved changeset atomically with preflight validation,
   * task-scoped backups, atomic same-dir temp file writes, post-write verification,
   * and complete rollback on any failure.
   */
  async apply(input: { changesetId: string; approvedById: string }): Promise<AppliedChangesetResult> {
    const changeset = await this.getById(input.changesetId);
    if (!changeset) {
      throw new Error(`Changeset not found: "${input.changesetId}"`);
    }

    const wsRoot = this.getEffectiveWorkspaceRoot();

    // 1. Preflight: Check staleness immediately before applying
    const staleCheck = await this.checkStale(input.changesetId);
    if (staleCheck.isStale) {
      const err = `Cannot apply stale changeset. Files modified since proposal: ${staleCheck.staleFiles.join(', ')}`;
      return {
        success: false,
        changeset,
        appliedFiles: [],
        error: err,
      };
    }

    // 2. Preflight path and security checks
    for (const op of changeset.operations) {
      PathGuard.resolveSafe(wsRoot, op.path, { allowProtected: false });
    }

    // 3. Backup creation in task-scoped storage
    const storageDir = resolveStorageDir();
    const backupDir = resolve(storageDir, 'backups', changeset.taskId, changeset.id);
    mkdirSync(backupDir, { recursive: true });

    const backedUpFiles: string[] = [];
    const memoryBackups = new Map<string, { exists: boolean; buffer: Buffer | null; cleanPath: string }>();

    for (const diff of changeset.diffs) {
      const cleanPath = diff.filePath.replace(/\\/g, '/');
      const absPath = resolve(wsRoot, cleanPath);
      const exists = existsSync(absPath);

      if (exists) {
        const buf = readFileSync(absPath);
        memoryBackups.set(absPath, { exists: true, buffer: buf, cleanPath });

        // Save physical file copy in backup directory
        const safeBackupFileName = cleanPath.replace(/[^a-zA-Z0-9._-]/g, '_');
        const backupFilePath = resolve(backupDir, safeBackupFileName);
        writeFileSync(backupFilePath, buf);
        backedUpFiles.push(cleanPath);
      } else {
        memoryBackups.set(absPath, { exists: false, buffer: null, cleanPath });
      }
    }

    if (this.eventBus) {
      await this.eventBus.publish({
        eventId: generateId('evt'),
        taskId: changeset.taskId,
        nodeId: changeset.nodeId,
        type: 'file_backup_created',
        timestamp: getTimestamp(),
        actorType: 'system',
        actorId: 'workspace_transaction',
        correlationId: generateId('corr'),
        payload: {
          changesetId: changeset.id,
          backupDir,
          backedUpFiles,
        },
      });
    }

    // 4. Apply operations with same-directory temp files + atomic rename
    const appliedFiles: string[] = [];
    const createdDirs: string[] = [];

    try {
      // Step A: Ensure directories exist
      for (const op of changeset.operations) {
        if (op.operation === 'create_folder') {
          const cleanDir = op.path.replace(/\\/g, '/');
          const safeAbsDir = PathGuard.resolveSafe(wsRoot, cleanDir, { allowProtected: false });
          if (!existsSync(safeAbsDir)) {
            mkdirSync(safeAbsDir, { recursive: true });
            createdDirs.push(safeAbsDir);
          }
        }
      }

      // Step B: Apply diffs
      for (const diff of changeset.diffs) {
        const cleanPath = diff.filePath.replace(/\\/g, '/');
        const absPath = PathGuard.resolveSafe(wsRoot, cleanPath, { allowProtected: false });
        const parentDir = dirname(absPath);

        if (diff.changeType === 'delete') {
          if (existsSync(absPath)) {
            unlinkSync(absPath);
          }
        } else if (diff.newContent !== null && diff.newContent !== undefined) {
          if (!existsSync(parentDir)) {
            mkdirSync(parentDir, { recursive: true });
            createdDirs.push(parentDir);
          }

          // Write same-directory temporary file
          const nonce = randomBytes(6).toString('hex');
          const tempPath = resolve(parentDir, `.tmp_${nonce}_${cleanPath.split('/').pop()}`);
          writeFileSync(tempPath, diff.newContent, 'utf8');

          try {
            renameSync(tempPath, absPath);
          } catch {
            // Fallback replacement if cross-device or Windows locked
            if (existsSync(absPath)) {
              unlinkSync(absPath);
            }
            renameSync(tempPath, absPath);
          }
        }

        appliedFiles.push(cleanPath);
      }

      // 5. Post-write Verification: Re-read every written file and verify content hash
      for (const diff of changeset.diffs) {
        if (diff.changeType !== 'delete' && typeof diff.newContent === 'string') {
          const absPath = resolve(wsRoot, diff.filePath);
          const expectedSha = this.diff.computeSha256(diff.newContent);

          const currentSha = this.diff.getFileSha256(absPath);
          if (currentSha !== expectedSha) {
            throw new Error(`Hash verification failed for written file "${diff.filePath}"`);
          }
        }
      }

      const now = getTimestamp();
      changeset.status = 'applied';
      changeset.appliedAt = now;
      changeset.updatedAt = now;
      this.inMemoryStore.set(changeset.id, changeset);

      if (this.changesetRepo) {
        try {
          await this.changesetRepo.update(changeset);
        } catch {
          // ignore
        }
      }

      if (this.eventBus) {
        await this.eventBus.publish({
          eventId: generateId('evt'),
          taskId: changeset.taskId,
          nodeId: changeset.nodeId,
          type: 'changeset_applied',
          timestamp: now,
          actorType: 'user',
          actorId: input.approvedById,
          correlationId: generateId('corr'),
          payload: {
            changesetId: changeset.id,
            appliedFiles,
            additions: changeset.additions,
            deletions: changeset.deletions,
          },
        });
      }

      return {
        success: true,
        changeset,
        appliedFiles,
      };
    } catch (err: unknown) {
      // 6. Rollback in reverse order
      const restoredFiles: string[] = [];
      const memoryEntries = Array.from(memoryBackups.entries()).reverse();

      for (const [absPath, backup] of memoryEntries) {
        try {
          if (backup.exists && backup.buffer !== null) {
            writeFileSync(absPath, backup.buffer);
            restoredFiles.push(backup.cleanPath);
          } else if (!backup.exists && existsSync(absPath)) {
            unlinkSync(absPath);
            restoredFiles.push(backup.cleanPath);
          }
        } catch {
          // Best effort rollback
        }
      }

      const now = getTimestamp();
      changeset.status = 'failed';
      changeset.failureReason = err instanceof Error ? err.message : String(err);
      changeset.updatedAt = now;
      this.inMemoryStore.set(changeset.id, changeset);

      if (this.changesetRepo) {
        try {
          await this.changesetRepo.update(changeset);
        } catch {
          // ignore
        }
      }

      if (this.eventBus) {
        await this.eventBus.publish({
          eventId: generateId('evt'),
          taskId: changeset.taskId,
          nodeId: changeset.nodeId,
          type: 'file_rollback_completed',
          timestamp: now,
          actorType: 'system',
          actorId: 'workspace_transaction',
          correlationId: generateId('corr'),
          payload: {
            changesetId: changeset.id,
            restoredFiles,
            error: changeset.failureReason,
          },
        });

        await this.eventBus.publish({
          eventId: generateId('evt'),
          taskId: changeset.taskId,
          nodeId: changeset.nodeId,
          type: 'changeset_failed',
          timestamp: now,
          actorType: 'system',
          actorId: 'workspace_transaction',
          correlationId: generateId('corr'),
          payload: {
            changesetId: changeset.id,
            error: changeset.failureReason,
            rolledBack: true,
          },
        });
      }

      return {
        success: false,
        changeset,
        appliedFiles: [],
        error: `Application failed: ${changeset.failureReason}. All changes rolled back.`,
      };
    }
  }
}

export const changesetService = new DefaultChangesetService();
