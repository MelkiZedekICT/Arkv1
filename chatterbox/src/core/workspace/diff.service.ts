import { createTwoFilesPatch } from 'diff';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, renameSync } from 'fs';
import { dirname, resolve } from 'path';
import { createHash, randomBytes } from 'crypto';
import { ProposedFileOperation, ProposedChangeset, UnifiedDiff } from '../agents/schemas/coding-schemas.js';
import { AgentRole } from '../models/enums.js';
import { generateId } from '../../utils/ids.js';
import { getTimestamp } from '../../utils/time.js';

export interface ProposedDiff {
  filePath: string;
  changeType: 'create' | 'edit' | 'delete';
  oldContent: string | null;
  newContent: string | null;
  unifiedDiff: string;
  additions: number;
  deletions: number;
  originalSha256?: string;
}

export class DiffService {
  /**
   * Detects if a buffer contains binary data (e.g. null bytes).
   */
  isBinaryBuffer(buffer: Buffer): boolean {
    const maxBytes = Math.min(buffer.length, 8000);
    for (let i = 0; i < maxBytes; i++) {
      if (buffer[i] === 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Normalizes line endings to LF (\n) to prevent whitespace drift across platforms.
   */
  normalizeText(content: string): string {
    return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  /**
   * Computes SHA-256 hash of string or Buffer content.
   */
  computeSha256(content: string | Buffer): string {
    if (typeof content === 'string') {
      return createHash('sha256').update(content, 'utf8').digest('hex');
    }
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Reads a file and returns its SHA-256 hash, or null if the file does not exist.
   */
  getFileSha256(absoluteFilePath: string): string | null {
    if (!existsSync(absoluteFilePath)) {
      return null;
    }
    try {
      const buffer = readFileSync(absoluteFilePath);
      return this.computeSha256(buffer);
    } catch {
      return null;
    }
  }

  /**
   * Generates a unified diff comparing oldContent and newContent.
   */
  createUnifiedDiff(
    filePath: string,
    oldContent: string | null,
    newContent: string | null
  ): { diff: string; additions: number; deletions: number } {
    const res = this.generateDiff(filePath, oldContent, newContent);
    return {
      diff: res.unifiedDiff,
      additions: res.additions,
      deletions: res.deletions,
    };
  }

  /**
   * Generates a single unified diff patch with additions/deletions counts.
   * Throws an error if content contains binary data.
   */
  generateDiff(
    filePath: string,
    oldContent: string | null,
    newContent: string | null,
    originalSha256?: string
  ): ProposedDiff {
    const cleanPath = filePath.replace(/\\/g, '/');

    // Binary check
    if (oldContent !== null && oldContent.includes('\0')) {
      throw new Error(`Cannot generate diff for binary content: "${cleanPath}"`);
    }
    if (newContent !== null && newContent.includes('\0')) {
      throw new Error(`Cannot generate diff for binary content: "${cleanPath}"`);
    }

    const isNew = oldContent === null;
    const isDelete = newContent === null;

    // Normalize line endings consistently to LF
    const oldStr = oldContent !== null ? this.normalizeText(oldContent) : '';
    const newStr = newContent !== null ? this.normalizeText(newContent) : '';

    const changeType: 'create' | 'edit' | 'delete' = isNew
      ? 'create'
      : isDelete
        ? 'delete'
        : 'edit';

    const oldLabel = isNew ? '/dev/null' : `a/${cleanPath}`;
    const newLabel = isDelete ? '/dev/null' : `b/${cleanPath}`;

    let patch = createTwoFilesPatch(
      oldLabel,
      newLabel,
      oldStr,
      newStr,
      isNew ? 'nonexistent' : 'original',
      isDelete ? 'deleted' : 'modified'
    );

    // Calculate additions and deletions
    let additions = 0;
    let deletions = 0;
    const lines = patch.split('\n');
    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        additions++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        deletions++;
      }
    }

    // Ensure clean trailing newline
    if (!patch.endsWith('\n')) {
      patch += '\n';
    }

    return {
      filePath: cleanPath,
      changeType,
      oldContent,
      newContent,
      unifiedDiff: patch,
      additions,
      deletions,
      originalSha256: originalSha256 ?? (oldContent !== null ? this.computeSha256(oldContent) : undefined),
    };
  }

  /**
   * Combines multiple file diffs into a single reviewable unified diff artifact.
   */
  generateCombinedDiff(diffs: UnifiedDiff[]): string {
    if (diffs.length === 0) {
      return '';
    }
    return diffs
      .map((d) => d.unifiedDiff.trim())
      .filter((d) => d.length > 0)
      .join('\n\n') + '\n';
  }

  /**
   * Proposes a file creation diff.
   */
  proposeCreate(filePath: string, content: string): ProposedDiff {
    return this.generateDiff(filePath, null, content);
  }

  /**
   * Proposes a file edit diff against existing file on disk.
   */
  proposeEdit(absoluteFilePath: string, relativePath: string, newContent: string): ProposedDiff {
    const exists = existsSync(absoluteFilePath);
    if (!exists) {
      return this.generateDiff(relativePath, '', newContent);
    }
    const buffer = readFileSync(absoluteFilePath);
    if (this.isBinaryBuffer(buffer)) {
      throw new Error(`Cannot diff binary file: "${relativePath}"`);
    }
    const existingContent = buffer.toString('utf8');
    const sha = this.computeSha256(existingContent);
    return this.generateDiff(relativePath, existingContent, newContent, sha);
  }

  /**
   * Proposes a file deletion diff.
   */
  proposeDelete(absoluteFilePath: string, relativePath: string): ProposedDiff {
    const exists = existsSync(absoluteFilePath);
    if (!exists) {
      return this.generateDiff(relativePath, '', null);
    }
    const buffer = readFileSync(absoluteFilePath);
    if (this.isBinaryBuffer(buffer)) {
      throw new Error(`Cannot diff binary file: "${relativePath}"`);
    }
    const existingContent = buffer.toString('utf8');
    const sha = this.computeSha256(existingContent);
    return this.generateDiff(relativePath, existingContent, null, sha);
  }

  /**
   * Creates a multi-file proposed changeset with content hashes computed at proposal time.
   */
  createChangeset(
    taskId: string,
    nodeId: string,
    operations: ProposedFileOperation[],
    workspaceRoot: string,
    options?: {
      agentRole?: AgentRole;
      summary?: string;
    }
  ): ProposedChangeset {
    const diffs: UnifiedDiff[] = [];
    const fileHashes: Record<string, string> = {};
    let totalAdditions = 0;
    let totalDeletions = 0;

    for (const op of operations) {
      if (op.operation === 'create_folder') {
        continue;
      }

      const cleanPath = op.path.replace(/\\/g, '/');
      const absPath = resolve(workspaceRoot, op.path);
      const fileExists = existsSync(absPath);

      let originalContent: string | null = null;
      let originalSha256: string | undefined = undefined;

      if (fileExists) {
        const buffer = readFileSync(absPath);
        if (this.isBinaryBuffer(buffer)) {
          throw new Error(`Cannot include binary file in diff: "${cleanPath}"`);
        }
        originalContent = buffer.toString('utf8');
        originalSha256 = this.computeSha256(originalContent);
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

      const diffResult = this.generateDiff(cleanPath, originalContent, newContent, originalSha256);
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
    return {
      id: generateId('cset'),
      taskId,
      nodeId,
      agentRole: options?.agentRole ?? 'coder',
      operations,
      diffs,
      fileHashes,
      status: 'proposed',
      summary: options?.summary ?? `Changeset with ${diffs.length} file operation(s)`,
      additions: totalAdditions,
      deletions: totalDeletions,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Verifies if any file in the changeset has changed on disk since the diff was proposed.
   */
  isChangesetStale(
    workspaceRoot: string,
    changeset: ProposedChangeset
  ): { isStale: boolean; staleFiles: string[]; details: Record<string, { expected: string | null; actual: string | null }> } {
    const staleFiles: string[] = [];
    const details: Record<string, { expected: string | null; actual: string | null }> = {};

    for (const diff of changeset.diffs) {
      const absPath = resolve(workspaceRoot, diff.filePath);
      const currentSha = this.getFileSha256(absPath);
      const expectedSha = changeset.fileHashes[diff.filePath] ?? diff.originalSha256 ?? null;

      if (diff.changeType === 'create') {
        // If file was nonexistent at proposal time, but now exists on disk, it's stale
        if (currentSha !== null) {
          staleFiles.push(diff.filePath);
          details[diff.filePath] = { expected: null, actual: currentSha };
        }
      } else {
        // If file was edited or deleted, its current disk SHA must match proposal expectedSha
        if (expectedSha !== null && currentSha !== expectedSha) {
          staleFiles.push(diff.filePath);
          details[diff.filePath] = { expected: expectedSha, actual: currentSha };
        } else if (expectedSha === null && currentSha !== null) {
          staleFiles.push(diff.filePath);
          details[diff.filePath] = { expected: null, actual: currentSha };
        } else if (expectedSha !== null && currentSha === null) {
          staleFiles.push(diff.filePath);
          details[diff.filePath] = { expected: expectedSha, actual: null };
        }
      }
    }

    return {
      isStale: staleFiles.length > 0,
      staleFiles,
      details,
    };
  }

  /**
   * Applies an approved changeset atomically with same-directory temp file + rename and rollback.
   * If any file is stale, rejects the apply and marks changeset stale.
   * If an error occurs midway, rolls back applied operations.
   */
  applyChangeset(
    workspaceRoot: string,
    changeset: ProposedChangeset
  ): { success: boolean; appliedFiles: string[]; error?: string } {
    // 1. Verify staleness first
    const staleness = this.isChangesetStale(workspaceRoot, changeset);
    if (staleness.isStale) {
      changeset.status = 'stale';
      changeset.updatedAt = getTimestamp();
      return {
        success: false,
        appliedFiles: [],
        error: `Cannot apply stale changeset. Files modified since proposal: ${staleness.staleFiles.join(', ')}`,
      };
    }

    // 2. Prepare backups for atomic rollback
    const backups = new Map<string, { exists: boolean; content: Buffer | null }>();
    const appliedFiles: string[] = [];
    const createdDirs: string[] = [];

    try {
      // First ensure folders exist
      for (const op of changeset.operations) {
        if (op.operation === 'create_folder') {
          const absDir = resolve(workspaceRoot, op.path);
          if (!existsSync(absDir)) {
            mkdirSync(absDir, { recursive: true });
            createdDirs.push(absDir);
          }
        }
      }

      // Apply each file diff
      for (const diff of changeset.diffs) {
        const absPath = resolve(workspaceRoot, diff.filePath);
        const fileExisted = existsSync(absPath);
        backups.set(absPath, {
          exists: fileExisted,
          content: fileExisted ? readFileSync(absPath) : null,
        });

        if (diff.changeType === 'delete') {
          if (fileExisted) {
            unlinkSync(absPath);
          }
        } else if (diff.newContent !== null && diff.newContent !== undefined) {
          const parentDir = dirname(absPath);
          if (!existsSync(parentDir)) {
            mkdirSync(parentDir, { recursive: true });
          }

          // Same-directory temporary file for atomic rename
          const nonce = randomBytes(6).toString('hex');
          const tempPath = resolve(parentDir, `.tmp_${nonce}_${diff.filePath.split('/').pop()}`);
          writeFileSync(tempPath, diff.newContent, 'utf8');

          try {
            renameSync(tempPath, absPath);
          } catch {
            // Fallback for Windows or cross-device file replacement
            if (existsSync(absPath)) {
              unlinkSync(absPath);
            }
            renameSync(tempPath, absPath);
          }
        }

        appliedFiles.push(diff.filePath);
      }

      // 4. Verify post-write content hash
      for (const diff of changeset.diffs) {
        if (diff.changeType !== 'delete' && typeof diff.newContent === 'string') {
          const absPath = resolve(workspaceRoot, diff.filePath);
          const expectedSha = this.computeSha256(diff.newContent);

          const currentSha = this.getFileSha256(absPath);
          if (currentSha !== expectedSha) {
            throw new Error(`Verification failed for "${diff.filePath}": hash mismatch after write`);
          }
        }
      }

      changeset.status = 'applied';
      changeset.appliedAt = getTimestamp();
      changeset.updatedAt = getTimestamp();
      return {
        success: true,
        appliedFiles,
      };
    } catch (err) {
      // Rollback on partial failure in reverse order
      const backupEntries = Array.from(backups.entries()).reverse();
      for (const [absPath, backup] of backupEntries) {
        try {
          if (backup.exists && backup.content !== null) {
            writeFileSync(absPath, backup.content);
          } else if (!backup.exists && existsSync(absPath)) {
            unlinkSync(absPath);
          }
        } catch {
          // Best effort rollback
        }
      }

      changeset.status = 'failed';
      changeset.failureReason = err instanceof Error ? err.message : String(err);
      changeset.updatedAt = getTimestamp();

      return {
        success: false,
        appliedFiles: [],
        error: `Atomic apply failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Applies an approved diff to the filesystem safely.
   */
  applyApprovedDiff(absoluteFilePath: string, diff: ProposedDiff): void {
    if (diff.changeType === 'delete') {
      if (existsSync(absoluteFilePath)) {
        unlinkSync(absoluteFilePath);
      }
      return;
    }

    if (diff.newContent !== null) {
      const parentDir = dirname(absoluteFilePath);
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true });
      }

      const nonce = randomBytes(6).toString('hex');
      const tempPath = resolve(parentDir, `.tmp_${nonce}`);
      writeFileSync(tempPath, diff.newContent, 'utf8');
      try {
        renameSync(tempPath, absoluteFilePath);
      } catch {
        if (existsSync(absoluteFilePath)) {
          unlinkSync(absoluteFilePath);
        }
        renameSync(tempPath, absoluteFilePath);
      }
    }
  }
}

export const diffService = new DiffService();
