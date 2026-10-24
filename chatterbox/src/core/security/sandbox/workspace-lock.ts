import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { resolveStorageDir } from '../../config/config.js';
import { SafeFileIo } from './safe-file-io.js';

export interface WorkspaceLockData {
  missionId: string;
  pid: number;
  createdAt: string;
  expiresAt: string;
  workspaceRoot: string;
}

export interface FileReservation {
  missionId: string;
  filePath: string;
  baseContentSha256: string;
  reservedAt: string;
}

export class WorkspaceLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceLockError';
  }
}

export class StaleDiffError extends Error {
  constructor(filePath: string, expectedHash: string, currentHash: string) {
    super(
      `Stale diff detected for "${filePath}". Base hash was ${expectedHash.slice(0, 8)}, but current file hash is ${currentHash.slice(0, 8)}. Modifications blocked; please regenerate diff.`
    );
    this.name = 'StaleDiffError';
  }
}

export class WorkspaceLockManager {
  private readonly storageDir: string;
  private readonly locksDir: string;
  private readonly lockFilePath: string;
  private readonly fileReservations = new Map<string, FileReservation>();

  constructor(customStorageDir?: string) {
    this.storageDir = customStorageDir || resolveStorageDir();
    this.locksDir = join(this.storageDir, 'locks');
    this.lockFilePath = join(this.locksDir, 'workspace.lock');
    if (!existsSync(this.locksDir)) {
      mkdirSync(this.locksDir, { recursive: true, mode: 0o700 });
    }
  }

  acquireWorkspaceLock(missionId: string, workspaceRoot: string, timeoutMinutes = 30): void {
    const now = new Date();
    const expires = new Date(now.getTime() + timeoutMinutes * 60 * 1000);

    if (existsSync(this.lockFilePath)) {
      try {
        const raw = readFileSync(this.lockFilePath, 'utf8');
        const existing = JSON.parse(raw) as WorkspaceLockData;

        // Check expiration
        const isExpired = new Date(existing.expiresAt).getTime() < now.getTime();
        let isPidAlive = false;
        try {
          if (existing.pid && typeof process.kill === 'function') {
            // Signal 0 tests process existence without killing it
            process.kill(existing.pid, 0);
            isPidAlive = true;
          }
        } catch {
          isPidAlive = false;
        }

        if (existing.missionId !== missionId && isPidAlive && !isExpired) {
          throw new WorkspaceLockError(
            `Workspace is currently locked by active mission "${existing.missionId}" (PID ${existing.pid}). Only one write-enabled mission may run per workspace at a time in v0.2.`
          );
        }
      } catch (err: unknown) {
        if (err instanceof WorkspaceLockError) throw err;
        // If file is unreadable/corrupt, remove stale lock
        try {
          unlinkSync(this.lockFilePath);
        } catch {
          // ignore
        }
      }
    }

    const lockData: WorkspaceLockData = {
      missionId,
      pid: process.pid,
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      workspaceRoot,
    };

    writeFileSync(this.lockFilePath, JSON.stringify(lockData, null, 2), 'utf8');
  }

  releaseWorkspaceLock(missionId: string): void {
    if (existsSync(this.lockFilePath)) {
      try {
        const raw = readFileSync(this.lockFilePath, 'utf8');
        const existing = JSON.parse(raw) as WorkspaceLockData;
        if (existing.missionId === missionId) {
          unlinkSync(this.lockFilePath);
        }
      } catch {
        // ignore
      }
    }
  }

  reserveFile(missionId: string, workspaceRoot: string, relativePath: string): FileReservation {
    let baseHash = 'empty_file';
    try {
      const readRes = SafeFileIo.safeReadText(workspaceRoot, relativePath);
      baseHash = createHash('sha256').update(readRes.content, 'utf8').digest('hex');
    } catch {
      // file might not exist yet if being created
    }

    const reservation: FileReservation = {
      missionId,
      filePath: relativePath,
      baseContentSha256: baseHash,
      reservedAt: new Date().toISOString(),
    };

    this.fileReservations.set(relativePath, reservation);
    return reservation;
  }

  assertDiffFresh(workspaceRoot: string, relativePath: string, expectedBaseHash: string): void {
    let currentHash = 'empty_file';
    try {
      const readRes = SafeFileIo.safeReadText(workspaceRoot, relativePath);
      currentHash = createHash('sha256').update(readRes.content, 'utf8').digest('hex');
    } catch {
      // file doesn't exist
    }

    if (currentHash !== expectedBaseHash) {
      throw new StaleDiffError(relativePath, expectedBaseHash, currentHash);
    }
  }
}
