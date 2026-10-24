/**
 * TOCTOU-safe File Operations for Chatterbox Workspace Sandbox.
 *
 * Implements defense-in-depth file access controls:
 * 1. Resolve workspace root once using realpath.
 * 2. Validate requested path immediately before access.
 * 3. Open a file descriptor and perform all reads/writes through it.
 * 4. Deny symlinks inside the workspace by default.
 * 5. Revalidate the parent directory before file creation.
 * 6. Use exclusive create flags for new files where appropriate.
 *
 * NOTE: Pure Node.js path checks are defense-in-depth containment, not a complete
 * OS-level security kernel boundary. OS-level containerization is recommended for high-risk untrusted code.
 */

import {
  openSync,
  closeSync,
  readSync,
  writeSync,
  fstatSync,
  lstatSync,
  existsSync,
  realpathSync,
  mkdirSync,
} from 'node:fs';
import { resolve, normalize, relative, dirname } from 'node:path';
import { isPathProtected } from '../../workspace/protected-paths.js';

export class SafeFileIoError extends Error {
  readonly code:
    | 'PATH_TRAVERSAL'
    | 'SYMLINK_DENIED'
    | 'PROTECTED_FILE'
    | 'INVALID_FILE_TYPE'
    | 'PARENT_DIR_ESCAPED'
    | 'IO_ERROR';

  constructor(
    message: string,
    code:
      | 'PATH_TRAVERSAL'
      | 'SYMLINK_DENIED'
      | 'PROTECTED_FILE'
      | 'INVALID_FILE_TYPE'
      | 'PARENT_DIR_ESCAPED'
      | 'IO_ERROR'
  ) {
    super(message);
    this.name = 'SafeFileIoError';
    this.code = code;
  }
}

export class SafeFileIo {
  /**
   * Resolves canonical workspace root once.
   */
  static getCanonicalRoot(workspaceRoot: string): string {
    const resolved = resolve(workspaceRoot);
    if (!existsSync(resolved)) {
      throw new SafeFileIoError(`Workspace root does not exist: "${workspaceRoot}"`, 'IO_ERROR');
    }
    return realpathSync(resolved);
  }

  /**
   * Asserts path containment and rejects traversal, null bytes, and symlinks.
   */
  static validateTarget(
    canonicalRoot: string,
    targetPath: string,
    options?: { allowSymlinks?: boolean }
  ): string {
    if (!targetPath || typeof targetPath !== 'string') {
      throw new SafeFileIoError('Target path must be a non-empty string.', 'PATH_TRAVERSAL');
    }

    if (targetPath.indexOf('\0') !== -1) {
      throw new SafeFileIoError('Null byte detected in path.', 'PATH_TRAVERSAL');
    }

    const resolved = resolve(canonicalRoot, targetPath);
    const normRoot = normalize(canonicalRoot).toLowerCase().replace(/[\\/]+$/, '');
    const normTarget = normalize(resolved).toLowerCase();

    // 1. Lexical prefix containment check
    if (normTarget !== normRoot && !normTarget.startsWith(normRoot + '\\') && !normTarget.startsWith(normRoot + '/')) {
      throw new SafeFileIoError(
        `Path traversal denied: "${targetPath}" resolves outside workspace "${canonicalRoot}".`,
        'PATH_TRAVERSAL'
      );
    }

    // 2. Relative segments check
    const rel = relative(canonicalRoot, resolved);
    if (rel.startsWith('..')) {
      throw new SafeFileIoError(
        `Path traversal denied: "${targetPath}" escapes workspace.`,
        'PATH_TRAVERSAL'
      );
    }

    // 3. Deny protected paths
    if (isPathProtected(rel) || isPathProtected(targetPath)) {
      throw new SafeFileIoError(
        `Access denied: "${rel}" is a protected file or directory (.env, keys, git, credentials).`,
        'PROTECTED_FILE'
      );
    }

    // 4. Deny symlinks by default
    if (!options?.allowSymlinks && existsSync(resolved)) {
      try {
        const lstat = lstatSync(resolved);
        if (lstat.isSymbolicLink()) {
          throw new SafeFileIoError(
            `Symlinks inside workspace are denied by default: "${rel}".`,
            'SYMLINK_DENIED'
          );
        }
      } catch (err: unknown) {
        if (err instanceof SafeFileIoError) throw err;
      }
    }

    return resolved;
  }

  /**
   * TOCTOU-safe file reader:
   * Validates path, denies symlinks, opens file descriptor, and reads through fd.
   */
  static safeReadText(
    workspaceRoot: string,
    targetPath: string,
    maxBytes = 5 * 1024 * 1024
  ): { content: string; sizeBytes: number; fd: number } {
    const canonicalRoot = this.getCanonicalRoot(workspaceRoot);
    const safePath = this.validateTarget(canonicalRoot, targetPath);

    if (!existsSync(safePath)) {
      throw new SafeFileIoError(`File not found: "${targetPath}"`, 'IO_ERROR');
    }

    // Open file descriptor immediately after validation
    const fd = openSync(safePath, 'r');
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile()) {
        throw new SafeFileIoError(`Path is not a regular file: "${targetPath}"`, 'INVALID_FILE_TYPE');
      }

      if (stat.size > maxBytes) {
        throw new SafeFileIoError(
          `File size (${stat.size} bytes) exceeds maximum limit (${maxBytes} bytes).`,
          'IO_ERROR'
        );
      }

      const buffer = Buffer.alloc(stat.size);
      readSync(fd, buffer, 0, stat.size, 0);
      const content = buffer.toString('utf8');

      return { content, sizeBytes: stat.size, fd };
    } finally {
      closeSync(fd);
    }
  }

  /**
   * TOCTOU-safe file writer:
   * Revalidates parent directory, opens fd, writes exclusively through fd.
   */
  static safeWriteText(
    workspaceRoot: string,
    targetPath: string,
    content: string,
    options?: { exclusive?: boolean }
  ): { bytesWritten: number } {
    const canonicalRoot = this.getCanonicalRoot(workspaceRoot);
    const safePath = this.validateTarget(canonicalRoot, targetPath);

    const parentDir = dirname(safePath);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    // Revalidate parent directory resolution
    const canonicalParent = realpathSync(parentDir);
    const normRoot = normalize(canonicalRoot).toLowerCase().replace(/[\\/]+$/, '');
    const normParent = normalize(canonicalParent).toLowerCase();
    if (normParent !== normRoot && !normParent.startsWith(normRoot + '\\') && !normParent.startsWith(normRoot + '/')) {
      throw new SafeFileIoError(
        `Parent directory escape denied: "${parentDir}" points outside workspace.`,
        'PARENT_DIR_ESCAPED'
      );
    }

    // Use exclusive flag 'wx' if requested, otherwise 'w'
    const flag = options?.exclusive ? 'wx' : 'w';
    const fd = openSync(safePath, flag);
    try {
      const buffer = Buffer.from(content, 'utf8');
      writeSync(fd, buffer, 0, buffer.length, 0);
      return { bytesWritten: buffer.length };
    } finally {
      closeSync(fd);
    }
  }
}
