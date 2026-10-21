import { existsSync, readFileSync, readdirSync, lstatSync } from 'fs';
import { relative, join, extname, basename } from 'path';
import { pathGuard } from './path-guard.js';
import { isPathProtected } from './protected-paths.js';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'cargo' | 'unknown';

export interface RepositoryContext {
  workspaceRoot: string;
  languages: string[];
  packageManager?: PackageManager;
  testCommand?: string;
  lintCommand?: string;
  typecheckCommand?: string;
  buildCommand?: string;
  relevantFiles: string[];
  projectStructure: string;
  conventions: string[];
}

export interface BuildContextOptions {
  goal?: string;
  maxFilesToScan?: number;
  maxTreeDepth?: number;
}

export class RepositoryContextService {
  /**
   * Analyzes workspace to extract structured repository context, conventions, and relevant files.
   */
  async buildContext(workspaceRoot: string, options: BuildContextOptions = {}): Promise<RepositoryContext> {
    const canonicalRoot = pathGuard.getCanonicalRoot(workspaceRoot);
    const { goal = '', maxTreeDepth = 3 } = options;

    const languagesSet = new Set<string>();
    const conventions: string[] = [];

    // 1. Detect Package Manager & Manifests
    let packageManager: PackageManager = 'unknown';
    let testCommand: string | undefined;
    let lintCommand: string | undefined;
    let typecheckCommand: string | undefined;
    let buildCommand: string | undefined;

    const pkgJsonPath = join(canonicalRoot, 'package.json');
    const pnpmLockPath = join(canonicalRoot, 'pnpm-lock.yaml');
    const yarnLockPath = join(canonicalRoot, 'yarn.lock');
    const npmLockPath = join(canonicalRoot, 'package-lock.json');
    const cargoTomlPath = join(canonicalRoot, 'Cargo.toml');
    const pyprojectPath = join(canonicalRoot, 'pyproject.toml');
    const tsconfigPath = join(canonicalRoot, 'tsconfig.json');

    if (existsSync(pnpmLockPath)) {
      packageManager = 'pnpm';
    } else if (existsSync(yarnLockPath)) {
      packageManager = 'yarn';
    } else if (existsSync(npmLockPath)) {
      packageManager = 'npm';
    } else if (existsSync(cargoTomlPath)) {
      packageManager = 'cargo';
    } else if (existsSync(pkgJsonPath)) {
      packageManager = 'npm';
    }

    if (existsSync(tsconfigPath)) {
      languagesSet.add('TypeScript');
      conventions.push('TypeScript project with tsconfig.json configuration');
    }

    if (existsSync(pkgJsonPath)) {
      try {
        const pkgRaw = readFileSync(pkgJsonPath, 'utf8');
        const pkg = JSON.parse(pkgRaw) as Record<string, unknown>;
        const scripts = (pkg.scripts as Record<string, string>) || {};
        const allDeps = {
          ...((pkg.dependencies as Record<string, string>) || {}),
          ...((pkg.devDependencies as Record<string, string>) || {}),
        };

        if (pkg.type === 'module') {
          conventions.push('Node.js ESM module (type: "module")');
        }

        if (allDeps['typescript'] || allDeps['tsx']) {
          languagesSet.add('TypeScript');
        }
        if (allDeps['vitest']) {
          conventions.push('Test framework: Vitest');
        } else if (allDeps['jest']) {
          conventions.push('Test framework: Jest');
        } else if (allDeps['mocha']) {
          conventions.push('Test framework: Mocha');
        }

        if (allDeps['zod']) {
          conventions.push('Validation: Zod schema validation');
        }
        if (allDeps['eslint']) {
          conventions.push('Linter: ESLint');
        }
        if (allDeps['prettier']) {
          conventions.push('Formatter: Prettier');
        }

        const runner = packageManager === 'pnpm' ? 'pnpm' : packageManager === 'yarn' ? 'yarn' : 'npm';

        if (scripts.test) {
          testCommand = runner === 'npm' ? 'npm test' : `${runner} test`;
        }
        if (scripts.lint) {
          lintCommand = runner === 'npm' ? 'npm run lint' : `${runner} lint`;
        }
        if (scripts.typecheck) {
          typecheckCommand = runner === 'npm' ? 'npm run typecheck' : `${runner} typecheck`;
        }
        if (scripts.build) {
          buildCommand = runner === 'npm' ? 'npm run build' : `${runner} build`;
        }
      } catch {
        // Fallback gracefully on corrupt package.json
      }
    }

    if (existsSync(cargoTomlPath)) {
      languagesSet.add('Rust');
      testCommand = testCommand || 'cargo test';
      buildCommand = buildCommand || 'cargo build';
      conventions.push('Rust project managed by Cargo');
    }

    if (existsSync(pyprojectPath) || existsSync(join(canonicalRoot, 'requirements.txt'))) {
      languagesSet.add('Python');
      testCommand = testCommand || 'pytest';
      conventions.push('Python project structure');
    }

    // 2. Scan Workspace Tree and Discover Files (Strictly excluding protected paths)
    const scannedFiles: string[] = [];
    const treeLines: string[] = [];

    const walk = (currentDir: string, depth: number) => {
      if (depth > maxTreeDepth) return;
      let entries: string[];
      try {
        entries = readdirSync(currentDir).sort();
      } catch {
        return;
      }

      for (const entry of entries) {
        if (entry.startsWith('.') && entry !== '.chatterbox') {
          // Skip hidden directories like .git, .env, .agentfeed
          continue;
        }
        if (['node_modules', 'dist', 'build', 'out', 'target', 'coverage', '.cache'].includes(entry)) {
          continue;
        }

        const fullPath = join(currentDir, entry);
        const relPath = relative(canonicalRoot, fullPath);

        // Security assertion: Never inspect protected paths
        if (isPathProtected(relPath)) {
          continue;
        }

        let stat;
        try {
          stat = lstatSync(fullPath);
        } catch {
          continue;
        }

        const indent = '  '.repeat(depth);
        if (stat.isDirectory()) {
          treeLines.push(`${indent}${entry}/`);
          walk(fullPath, depth + 1);
        } else if (stat.isFile()) {
          scannedFiles.push(relPath);
          treeLines.push(`${indent}${entry}`);

          const ext = extname(entry).toLowerCase();
          if (['.ts', '.tsx'].includes(ext)) languagesSet.add('TypeScript');
          else if (['.js', '.jsx', '.mjs', '.cjs'].includes(ext)) languagesSet.add('JavaScript');
          else if (['.py'].includes(ext)) languagesSet.add('Python');
          else if (['.rs'].includes(ext)) languagesSet.add('Rust');
          else if (['.go'].includes(ext)) languagesSet.add('Go');
          else if (['.html'].includes(ext)) languagesSet.add('HTML');
          else if (['.css', '.scss'].includes(ext)) languagesSet.add('CSS');
        }
      }
    };

    walk(canonicalRoot, 0);

    const projectStructure = treeLines.slice(0, 80).join('\n') || '(empty directory)';

    // 3. Identify Relevant Files based on user goal keywords
    const relevantFiles = this.identifyRelevantFiles(scannedFiles, goal);

    return {
      workspaceRoot: canonicalRoot,
      languages: Array.from(languagesSet),
      packageManager,
      testCommand,
      lintCommand,
      typecheckCommand,
      buildCommand,
      relevantFiles,
      projectStructure,
      conventions: conventions.length > 0 ? conventions : ['Standard workspace project'],
    };
  }

  /**
   * Filters and ranks files likely relevant to the user's objective without reading protected files.
   */
  private identifyRelevantFiles(files: string[], goal: string): string[] {
    if (!goal || files.length === 0) {
      return files.slice(0, 10);
    }

    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'to', 'for', 'in', 'on', 'with', 'by', 'of',
      'at', 'from', 'into', 'is', 'are', 'was', 'were', 'add', 'create', 'update',
      'fix', 'make', 'implement', 'code', 'file', 'task',
    ]);

    const keywords = goal
      .toLowerCase()
      .split(/[^a-z0-9_-]+/)
      .filter((w) => w.length >= 3 && !stopWords.has(w));

    if (keywords.length === 0) {
      return files.slice(0, 10);
    }

    interface ScoredFile {
      file: string;
      score: number;
    }

    const scored: ScoredFile[] = [];

    for (const file of files) {
      const lowerPath = file.toLowerCase();
      const base = basename(lowerPath);
      let score = 0;

      for (const kw of keywords) {
        if (base.includes(kw)) {
          score += 5;
        } else if (lowerPath.includes(kw)) {
          score += 2;
        }
      }

      // Slightly prioritize source code and test files over config/assets
      if (lowerPath.includes('src/') || lowerPath.includes('lib/')) score += 1;
      if (lowerPath.includes('test') || lowerPath.includes('spec')) score += 1;

      if (score > 0) {
        scored.push({ file, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const topMatches = scored.slice(0, 10).map((s) => s.file);

    if (topMatches.length > 0) {
      return topMatches;
    }

    // Fallback: return top candidate source files
    return files.filter((f) => f.startsWith('src/') || f.startsWith('lib/') || f.includes('test')).slice(0, 10);
  }
}

export const repositoryContextService = new RepositoryContextService();
