import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  LocalSandboxService,
  BudgetExceededError,
  DEFAULT_TASK_BUDGET,
} from '../../src/core/security/sandbox/local-sandbox.service.js';

describe('LocalSandboxService (Milestone 7)', () => {
  let tempBaseDir: string;
  let sandbox: LocalSandboxService;
  const taskId = 'task_sandbox_test';

  beforeEach(() => {
    tempBaseDir = mkdtempSync(join(tmpdir(), 'agentfeed-sandbox-'));
    sandbox = new LocalSandboxService(tempBaseDir);
  });

  afterEach(() => {
    try {
      rmSync(tempBaseDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('Path Containment & Security Checks', () => {
    it('allows valid paths inside task artifacts directory', () => {
      const result = sandbox.validatePath('report.md', taskId);
      expect(result.valid).toBe(true);
      expect(result.resolvedPath).toContain(taskId);
      expect(result.resolvedPath).toContain('report.md');
    });

    it('rejects artifact writes outside allowed task directory (Requirement 4)', () => {
      // Trying to write to another task's artifact directory or arbitrary directory
      const result = sandbox.validatePath('../../other_task/danger.txt', taskId);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Path traversal detected');

      expect(() => {
        sandbox.assertPathWithinTaskDirectory('../../other_task/danger.txt', taskId);
      }).toThrow(/Path traversal detected/);
    });

    it('rejects path traversal with parent directories and null bytes (Requirement 5)', () => {
      // 1. Path traversal with ..
      const traversal = sandbox.validatePath('../../../etc/passwd', taskId);
      expect(traversal.valid).toBe(false);
      expect(traversal.error).toContain('Path traversal detected');

      // 2. Null byte injection
      const nullByte = sandbox.validatePath('notes.md\0.exe', taskId);
      expect(nullByte.valid).toBe(false);
      expect(nullByte.error).toContain('null byte injection');
    });

    it('rejects symlink escape outside sandbox root (Requirement 6)', () => {
      const taskArtifactsDir = sandbox.getTaskArtifactsDir(taskId);
      mkdirSync(taskArtifactsDir, { recursive: true });

      // Create an external secret file outside sandbox
      const outsideDir = mkdtempSync(join(tmpdir(), 'agentfeed-outside-'));
      const outsideSecretFile = join(outsideDir, 'secret.conf');
      writeFileSync(outsideSecretFile, 'CRITICAL_SECRET_DATA');

      // Create a symlink inside taskArtifactsDir pointing outside
      const symlinkPath = join(taskArtifactsDir, 'symlink_escape');
      try {
        symlinkSync(outsideDir, symlinkPath, 'junction');

        // Validating a path through the symlink must detect the escape
        const result = sandbox.validatePath('symlink_escape/secret.conf', taskId);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Symlink escape detected');
      } catch (err: any) {
        // In environments where symlink creation requires admin privileges on Windows,
        // if symlinkSync throws EPERM, test that validatePath safely catches errors
        if (err.code !== 'EPERM') {
          throw err;
        }
      } finally {
        try {
          rmSync(outsideDir, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    });

    it('unconditionally prohibits shell and secret execution in sandbox assertions', () => {
      expect(() => sandbox.assertShellExecutionAllowed()).toThrow(/Shell execution is disabled/);
      expect(() => sandbox.assertSecretAccessAllowed()).toThrow(/Secret access is prohibited/);
    });
  });

  describe('Global Task Budgets (Requirement 17)', () => {
    it('uses default budget limits matching requirements', () => {
      const budget = sandbox.getBudget(taskId);
      expect(budget.maxAgentSteps).toBe(50);
      expect(budget.maxLlmCalls).toBe(40);
      expect(budget.maxElapsedMs).toBe(10 * 60 * 1000);
      expect(budget.maxTotalTokens).toBe(500000);
      expect(budget.maxArtifacts).toBe(20);
    });

    it('throws BudgetExceededError when agent steps budget is exceeded', () => {
      sandbox.configureBudget(taskId, { maxAgentSteps: 3 });

      sandbox.recordStep(taskId);
      sandbox.recordStep(taskId);
      sandbox.recordStep(taskId);

      expect(() => sandbox.recordStep(taskId)).toThrow(
        /Task budget exceeded: maxAgentSteps limit is 3, but current usage is 4/
      );
    });

    it('throws BudgetExceededError when LLM calls budget is exceeded', () => {
      sandbox.configureBudget(taskId, { maxLlmCalls: 2 });

      sandbox.recordLlmCall(taskId, 100);
      sandbox.recordLlmCall(taskId, 150);

      expect(() => sandbox.recordLlmCall(taskId, 50)).toThrow(
        /Task budget exceeded: maxLlmCalls limit is 2, but current usage is 3/
      );
    });

    it('throws BudgetExceededError when total token budget is exceeded', () => {
      sandbox.configureBudget(taskId, { maxTotalTokens: 1000 });

      sandbox.recordLlmCall(taskId, 800);
      expect(() => sandbox.recordLlmCall(taskId, 300)).toThrow(
        /Task budget exceeded: maxTotalTokens limit is 1000, but current usage is 1100/
      );
    });

    it('throws BudgetExceededError when artifact count budget is exceeded', () => {
      sandbox.configureBudget(taskId, { maxArtifacts: 2 });

      sandbox.recordArtifact(taskId);
      sandbox.recordArtifact(taskId);

      expect(() => sandbox.recordArtifact(taskId)).toThrow(
        /Task budget exceeded: maxArtifacts limit is 2, but current usage is 3/
      );
    });

    it('throws BudgetExceededError when duration budget is exceeded', () => {
      // Simulate elapsed time limit
      sandbox.configureBudget(taskId, { maxElapsedMs: 10 });
      const usage = sandbox.getUsage(taskId);
      usage.startTimeMs = Date.now() - 50; // 50ms ago, exceeding 10ms limit

      expect(() => sandbox.assertWithinBudget(taskId)).toThrow(BudgetExceededError);
      expect(() => sandbox.assertWithinBudget(taskId)).toThrow(/maxElapsedMs limit is 10/);
    });
  });
});
