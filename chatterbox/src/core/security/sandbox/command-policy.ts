import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface CommandInspectionResult {
  command: string;
  isSafe: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  resolvedScript?: string;
  reason?: string;
}

const DANGEROUS_PATTERNS = [
  /curl\s+[^|]+\|\s*(?:ba)?sh/i,
  /wget\s+[^|]+\|\s*(?:ba)?sh/i,
  /rm\s+-rf\s+[/~]/i,
  /del\s+\/s\s+\/q\s+[c-z]:\\/i,
  /powershell.*-enc/i,
  /nc\s+-e/i,
  />\s*\/dev\/tcp/i,
];

export class CommandPolicyService {
  /**
   * Inspects a command and any underlying package.json script to detect dangerous payloads.
   */
  static inspectCommand(command: string, cwd: string): CommandInspectionResult {
    const trimmed = command.trim();

    // 1. Direct command checks
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(trimmed)) {
        return {
          command: trimmed,
          isSafe: false,
          riskLevel: 'high',
          reason: `Detected dangerous shell pattern: ${pattern.source}`,
        };
      }
    }

    // 2. High-risk actions requiring explicit approval
    const lower = trimmed.toLowerCase();
    if (
      lower.startsWith('npm install') ||
      lower.startsWith('pnpm install') ||
      lower.startsWith('yarn add') ||
      lower.startsWith('pip install') ||
      lower.startsWith('git push') ||
      lower.startsWith('git commit')
    ) {
      return {
        command: trimmed,
        isSafe: true,
        riskLevel: 'high',
        reason: 'Dependency installation and git commit/push require explicit human approval.',
      };
    }

    // 3. Inspect package.json script definitions if executing npm/pnpm run or test
    if (lower.startsWith('npm test') || lower.startsWith('pnpm test') || lower.startsWith('npm run') || lower.startsWith('pnpm run')) {
      const pkgPath = join(cwd, 'package.json');
      if (existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
          let scriptKey = 'test';
          if (lower.includes(' run ')) {
            const parts = lower.split(/\s+/);
            const runIdx = parts.indexOf('run');
            scriptKey = parts[runIdx + 1] || 'test';
          }

          const scriptDefinition = pkg.scripts?.[scriptKey];
          if (scriptDefinition && typeof scriptDefinition === 'string') {
            for (const pattern of DANGEROUS_PATTERNS) {
              if (pattern.test(scriptDefinition)) {
                return {
                  command: trimmed,
                  isSafe: false,
                  riskLevel: 'high',
                  resolvedScript: scriptDefinition,
                  reason: `package.json script "${scriptKey}" contains dangerous pattern: ${scriptDefinition}`,
                };
              }
            }
            return {
              command: trimmed,
              isSafe: true,
              riskLevel: 'medium',
              resolvedScript: scriptDefinition,
            };
          }
        } catch {
          // invalid package.json
        }
      }
      return { command: trimmed, isSafe: true, riskLevel: 'medium' };
    }

    // Default safe read-only inspection commands
    if (lower === 'git status' || lower === 'git diff') {
      return { command: trimmed, isSafe: true, riskLevel: 'low' };
    }

    return { command: trimmed, isSafe: true, riskLevel: 'medium' };
  }
}
