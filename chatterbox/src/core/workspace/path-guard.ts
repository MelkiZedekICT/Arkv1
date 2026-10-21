import { existsSync, realpathSync } from 'fs';
import { resolve, normalize, relative, dirname } from 'path';
import { isPathProtected } from './protected-paths.js';

export class PathGuardError extends Error {
  readonly code:
    | 'TRAVERSAL_ATTEMPTED'
    | 'PATH_TRAVERSAL'
    | 'WORKSPACE_ESCAPE'
    | 'SYMLINK_ESCAPE'
    | 'PROTECTED_PATH'
    | 'INVALID_PATH';

  constructor(
    message: string,
    code:
      | 'TRAVERSAL_ATTEMPTED'
      | 'PATH_TRAVERSAL'
      | 'WORKSPACE_ESCAPE'
      | 'SYMLINK_ESCAPE'
      | 'PROTECTED_PATH'
      | 'INVALID_PATH'
  ) {
    super(message);
    this.name = 'PathGuardError';
    this.code = code;
  }
}

export { PathGuardError as WorkspaceSecurityError };

export type SafePath = string;

export interface AssertInsideWorkspaceInput {
  workspaceRoot: string;
  targetPath: string;
  customProtected?: string[];
  allowProtected?: boolean;
}

export interface IsProtectedInput {
  workspaceRoot: string;
  targetPath: string;
  customProtected?: string[];
}

export class PathGuard {
  /**
   * Statically checks whether a path or filename matches protected patterns.
   */
  static isProtected(targetPath: string, customProtected?: string[]): boolean {
    return isPathProtected(targetPath, customProtected);
  }

  /**
   * Statically resolves and verifies that targetPath resides safely inside workspace.
   */
  static resolveSafe(
    workspaceRoot: string,
    targetPath: string,
    options?: { allowProtected?: boolean; customProtected?: string[] }
  ): SafePath {
    if (!workspaceRoot || typeof workspaceRoot !== 'string') {
      throw new PathGuardError('Workspace root must be a non-empty string.', 'INVALID_PATH');
    }
    if (!targetPath || typeof targetPath !== 'string') {
      throw new PathGuardError('Target path must be a non-empty string.', 'INVALID_PATH');
    }

    // 1. Check for null byte injection
    if (targetPath.indexOf('\0') !== -1) {
      throw new PathGuardError('Null byte detected in path.', 'TRAVERSAL_ATTEMPTED');
    }

    const resolvedRoot = resolve(workspaceRoot);
    if (!existsSync(resolvedRoot)) {
      throw new PathGuardError(`Workspace root does not exist: "${workspaceRoot}"`, 'INVALID_PATH');
    }
    let canonicalRoot: string;
    try {
      canonicalRoot = realpathSync(resolvedRoot);
    } catch {
      canonicalRoot = resolvedRoot;
    }

    const resolvedTarget = resolve(canonicalRoot, targetPath);
    const normRoot = normalize(canonicalRoot).toLowerCase().replace(/[\\/]+$/, '');
    const normTarget = normalize(resolvedTarget).toLowerCase();

    // 2. Strict lexical containment check
    if (normTarget !== normRoot && !normTarget.startsWith(normRoot + '\\') && !normTarget.startsWith(normRoot + '/')) {
      throw new PathGuardError(
        `Path traversal denied: "${targetPath}" resolves outside workspace boundary "${workspaceRoot}".`,
        'TRAVERSAL_ATTEMPTED'
      );
    }

    // Check for suspicious '..' segments attempting traversal
    const normalizedRelative = relative(canonicalRoot, resolvedTarget);
    if (normalizedRelative.startsWith('..') || normalize(targetPath).includes('..\\..') || normalize(targetPath).includes('../../')) {
      if (normTarget !== normRoot && !normTarget.startsWith(normRoot + '\\') && !normTarget.startsWith(normRoot + '/')) {
        throw new PathGuardError(
          `Path traversal denied: "${targetPath}" attempts traversal outside workspace.`,
          'TRAVERSAL_ATTEMPTED'
        );
      }
    }

    // 3. Symlink escape check for existing path or nearest existing parent
    try {
      let probe = resolvedTarget;
      while (!existsSync(probe) && probe !== canonicalRoot && dirname(probe) !== probe) {
        probe = dirname(probe);
      }

      if (existsSync(probe)) {
        const realProbe = realpathSync(probe).toLowerCase().replace(/[\\/]+$/, '');
        if (realProbe !== normRoot && !realProbe.startsWith(normRoot + '\\') && !realProbe.startsWith(normRoot + '/')) {
          throw new PathGuardError(
            `Symlink escape denied: target "${targetPath}" realpath "${realProbe}" points outside workspace "${canonicalRoot}".`,
            'SYMLINK_ESCAPE'
          );
        }
      }
    } catch (err: unknown) {
      if (err instanceof PathGuardError) throw err;
      throw new PathGuardError(
        `Failed to verify symlink safety for path "${targetPath}": ${err instanceof Error ? err.message : String(err)}`,
        'INVALID_PATH'
      );
    }

    // 4. Protected paths verification
    const allowProtected = options?.allowProtected ?? false;
    const relFromRoot = relative(canonicalRoot, resolvedTarget);
    if (!allowProtected && (isPathProtected(relFromRoot, options?.customProtected) || isPathProtected(targetPath, options?.customProtected))) {
      throw new PathGuardError(
        `Access denied to protected path or file: "${relFromRoot}". Protected paths (.env, credentials, .git, node_modules, keys) cannot be accessed.`,
        'PROTECTED_PATH'
      );
    }

    return resolvedTarget;
  }

  /**
   * Resolves canonical real path of a workspace root.
   */
  getCanonicalRoot(workspaceRoot: string): string {
    if (!workspaceRoot || typeof workspaceRoot !== 'string') {
      throw new PathGuardError('Workspace root must be a non-empty string.', 'INVALID_PATH');
    }
    const resolved = resolve(workspaceRoot);
    if (!existsSync(resolved)) {
      throw new PathGuardError(`Workspace root does not exist: "${workspaceRoot}"`, 'INVALID_PATH');
    }
    try {
      return realpathSync(resolved);
    } catch {
      return resolved;
    }
  }

  /**
   * Asserts that targetPath resides safely inside the workspace boundary,
   * checking for path traversal, symlink escape, null bytes, and protected files.
   */
  async assertInsideWorkspace(input: AssertInsideWorkspaceInput): Promise<SafePath> {
    return PathGuard.resolveSafe(input.workspaceRoot, input.targetPath, {
      allowProtected: input.allowProtected,
      customProtected: input.customProtected,
    });
  }

  /**
   * Determines whether targetPath is protected.
   */
  async isProtected(input: IsProtectedInput): Promise<boolean> {
    const { workspaceRoot, targetPath, customProtected } = input;
    if (!targetPath) return false;
    try {
      const canonicalRoot = this.getCanonicalRoot(workspaceRoot);
      const resolved = resolve(canonicalRoot, targetPath);
      const rel = relative(canonicalRoot, resolved);
      return PathGuard.isProtected(rel, customProtected);
    } catch {
      return PathGuard.isProtected(targetPath, customProtected);
    }
  }
}

export const pathGuard = new PathGuard();
