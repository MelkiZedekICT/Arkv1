import { existsSync, realpathSync } from 'fs';
import { normalize, resolve, dirname } from 'path';
import { sanitizeErrorMessage } from '../../../utils/security.js';

export interface TaskBudgetConfig {
  maxAgentSteps: number;
  maxLlmCalls: number;
  maxElapsedMs: number;
  maxTotalTokens: number;
  maxArtifacts: number;
}

export const DEFAULT_TASK_BUDGET: TaskBudgetConfig = {
  maxAgentSteps: 50,
  maxLlmCalls: 40,
  maxElapsedMs: 10 * 60 * 1000,
  maxTotalTokens: 500000,
  maxArtifacts: 20,
};

export interface TaskBudgetUsage {
  agentSteps: number;
  llmCalls: number;
  startTimeMs: number;
  totalTokens: number;
  artifactCount: number;
}

export class BudgetExceededError extends Error {
  readonly budgetName: keyof TaskBudgetConfig;
  readonly limit: number;
  readonly current: number;

  constructor(budgetName: keyof TaskBudgetConfig, limit: number, current: number) {
    super(`Task budget exceeded: ${budgetName} limit is ${limit}, but current usage is ${current}.`);
    this.name = 'BudgetExceededError';
    this.budgetName = budgetName;
    this.limit = limit;
    this.current = current;
  }
}

export class LocalSandboxService {
  private readonly baseStorageDir: string;
  private readonly taskBudgets = new Map<string, TaskBudgetConfig>();
  private readonly taskUsage = new Map<string, TaskBudgetUsage>();

  constructor(baseStorageDir: string) {
    this.baseStorageDir = resolve(baseStorageDir);
  }

  getTaskArtifactsDir(taskId: string): string {
    const safeTaskId = taskId.replace(/[^a-zA-Z0-9_-]/g, '');
    return resolve(this.baseStorageDir, 'artifacts', safeTaskId);
  }

  configureBudget(taskId: string, budget: Partial<TaskBudgetConfig>): void {
    const current = this.taskBudgets.get(taskId) || { ...DEFAULT_TASK_BUDGET };
    this.taskBudgets.set(taskId, { ...current, ...budget });
  }

  getBudget(taskId: string): TaskBudgetConfig {
    return this.taskBudgets.get(taskId) || { ...DEFAULT_TASK_BUDGET };
  }

  getUsage(taskId: string): TaskBudgetUsage {
    let usage = this.taskUsage.get(taskId);
    if (!usage) {
      usage = {
        agentSteps: 0,
        llmCalls: 0,
        startTimeMs: Date.now(),
        totalTokens: 0,
        artifactCount: 0,
      };
      this.taskUsage.set(taskId, usage);
    }
    return usage;
  }

  recordStep(taskId: string): void {
    const usage = this.getUsage(taskId);
    usage.agentSteps += 1;
    this.assertWithinBudget(taskId);
  }

  recordLlmCall(taskId: string, tokens = 0): void {
    const usage = this.getUsage(taskId);
    usage.llmCalls += 1;
    usage.totalTokens += tokens;
    this.assertWithinBudget(taskId);
  }

  recordArtifact(taskId: string): void {
    const usage = this.getUsage(taskId);
    usage.artifactCount += 1;
    this.assertWithinBudget(taskId);
  }

  assertWithinBudget(taskId: string): void {
    const budget = this.getBudget(taskId);
    const usage = this.getUsage(taskId);

    if (usage.agentSteps > budget.maxAgentSteps) {
      throw new BudgetExceededError('maxAgentSteps', budget.maxAgentSteps, usage.agentSteps);
    }

    if (usage.llmCalls > budget.maxLlmCalls) {
      throw new BudgetExceededError('maxLlmCalls', budget.maxLlmCalls, usage.llmCalls);
    }

    if (usage.totalTokens > budget.maxTotalTokens) {
      throw new BudgetExceededError('maxTotalTokens', budget.maxTotalTokens, usage.totalTokens);
    }

    if (usage.artifactCount > budget.maxArtifacts) {
      throw new BudgetExceededError('maxArtifacts', budget.maxArtifacts, usage.artifactCount);
    }

    const elapsed = Date.now() - usage.startTimeMs;
    if (elapsed > budget.maxElapsedMs) {
      throw new BudgetExceededError('maxElapsedMs', budget.maxElapsedMs, elapsed);
    }
  }

  /**
   * Validates that target path is safely contained within .agentfeed/artifacts/<taskId>/
   * Rejects path traversal, null bytes, symlink escapes, and absolute escapes.
   */
  validatePath(targetPath: string, taskId: string): { valid: boolean; resolvedPath?: string; error?: string } {
    if (!targetPath || typeof targetPath !== 'string') {
      return { valid: false, error: 'Path must be a non-empty string.' };
    }

    // 1. Check for null byte injection
    if (targetPath.indexOf('\0') !== -1) {
      return { valid: false, error: 'Path traversal or null byte injection detected.' };
    }

    const taskDir = this.getTaskArtifactsDir(taskId);
    const resolved = resolve(taskDir, targetPath);

    const normalizedTaskDir = normalize(taskDir).toLowerCase();
    const normalizedTarget = normalize(resolved).toLowerCase();

    // 2. Strict containment check via normalize & resolve
    if (!normalizedTarget.startsWith(normalizedTaskDir)) {
      return {
        valid: false,
        error: `Path traversal detected: target "${targetPath}" resolves outside allowed directory "${taskDir}".`,
      };
    }

    // 3. Symlink escape check
    try {
      if (existsSync(taskDir)) {
        const realBase = realpathSync(taskDir).toLowerCase();
        let checkTarget = resolved;
        while (!existsSync(checkTarget) && checkTarget !== taskDir && checkTarget !== dirname(checkTarget)) {
          checkTarget = dirname(checkTarget);
        }

        if (existsSync(checkTarget)) {
          const realTarget = realpathSync(checkTarget).toLowerCase();
          if (!realTarget.startsWith(realBase)) {
            return {
              valid: false,
              error: `Symlink escape detected: real path "${realTarget}" resolves outside allowed directory "${realBase}".`,
            };
          }
        }
      }
    } catch (err) {
      return {
        valid: false,
        error: `Failed to verify symlink safety: ${sanitizeErrorMessage(err)}`,
      };
    }

    return { valid: true, resolvedPath: resolved };
  }

  assertPathWithinTaskDirectory(targetPath: string, taskId: string): string {
    const result = this.validatePath(targetPath, taskId);
    if (!result.valid || !result.resolvedPath) {
      throw new Error(result.error || 'Path validation failed.');
    }
    return result.resolvedPath;
  }

  assertShellExecutionAllowed(): never {
    throw new Error('Permission denied: shell:execute. Shell execution is disabled in AgentFeed v1.');
  }

  assertSecretAccessAllowed(): never {
    throw new Error('Permission denied: secret:read. Secret access is prohibited in AgentFeed v1.');
  }

  assertNetworkAllowed(url?: string): void {
    if (!url) return;
    const lower = url.toLowerCase();
    const isMock = lower.includes('example.com') || lower.includes('mock') || lower.startsWith('http://localhost');
    if (!isMock) {
      throw new Error(`Permission denied: network:request outside mock allowlist for "${url}".`);
    }
  }
}
