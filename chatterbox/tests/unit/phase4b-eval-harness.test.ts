import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { EvalRunner } from '../../src/core/evals/index.js';

describe('Milestone 10 Phase 4b: Evaluation Harness', () => {
  let tempReportDir: string;
  let runner: EvalRunner;

  beforeEach(() => {
    tempReportDir = mkdtempSync(join(tmpdir(), 'eval-harness-test-'));
    runner = new EvalRunner(undefined, tempReportDir);
  });

  afterEach(() => {
    try {
      rmSync(tempReportDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // 14. Eval cases validate correctly
  it('14. Eval cases validate correctly and load all 4 standard benchmark cases', () => {
    const cases = runner.loadCases();
    expect(cases.length).toBe(4);

    const ids = cases.map((c) => c.id);
    expect(ids).toContain('add-input-validation');
    expect(ids).toContain('fix-failing-test');
    expect(ids).toContain('add-readme-section');
    expect(ids).toContain('refactor-helper-function');

    for (const c of cases) {
      expect(c.id).toBeDefined();
      expect(c.goal).toBeDefined();
      expect(c.workspaceFixture).toBeDefined();
      expect(c.mode).toBe('mock');
      expect(Array.isArray(c.expectedFiles)).toBe(true);
      expect(c.expectedFiles.length).toBeGreaterThan(0);
      expect(Array.isArray(c.mustNotModify)).toBe(true);
      expect(c.mustNotModify.length).toBeGreaterThan(0);
      expect(Array.isArray(c.successCriteria)).toBe(true);
      expect(c.successCriteria.length).toBeGreaterThan(0);
    }
  });

  // 15. Eval runner executes a mock case end to end
  it('15. Eval runner executes a mock case end to end with all 5 deterministic graders', async () => {
    const cases = runner.loadCases();
    const targetCase = cases.find((c) => c.id === 'add-input-validation')!;

    const result = await runner.runCase(targetCase, { forceMock: true });

    expect(result.caseId).toBe('add-input-validation');
    expect(result.success).toBe(true);
    expect(result.diffAccepted).toBe(true);
    expect(result.testsPassed).toBe(true);
    expect(result.graders.length).toBe(5);

    const graderNames = result.graders.map((g) => g.grader);
    expect(graderNames).toContain('file-changed');
    expect(graderNames).toContain('diff-exists');
    expect(graderNames).toContain('tests-passed');
    expect(graderNames).toContain('no-protected-path-modified');
    expect(graderNames).toContain('change-summary-exists');

    // All graders passed
    for (const grader of result.graders) {
      expect(grader.passed).toBe(true);
      expect(grader.score).toBe(1);
    }

    // 17. Protected-path violations are always zero
    expect(result.protectedPathViolations).toBe(0);
  });

  // 16. Eval report records success/failure and usage
  it('16. Eval report records success/failure, usage metrics, and persists report', async () => {
    const report = await runner.runAll('add-input-validation', { forceMock: true });

    expect(report.totalCases).toBe(1);
    expect(report.passedCases).toBe(1);
    expect(report.taskSuccessRate).toBe(1.0);
    expect(report.diffAcceptanceRate).toBe(1.0);
    expect(report.testPassRate).toBe(1.0);
    expect(report.averageInterventions).toBeGreaterThanOrEqual(0);
    expect(report.averageDurationMs).toBeGreaterThan(0);
    expect(report.totalTokens).toBeGreaterThan(0);
    expect(report.totalEstimatedCostUsd).toBeGreaterThanOrEqual(0);

    // 17. Protected-path violations are always zero
    expect(report.protectedPathViolations).toBe(0);

    // Saved report persistence check
    const savedReport = runner.getLatestReport();
    expect(savedReport).toBeDefined();
    expect(savedReport?.totalCases).toBe(1);
    expect(savedReport?.protectedPathViolations).toBe(0);
    expect(existsSync(join(tempReportDir, 'eval-report.json'))).toBe(true);
  });
}, 30000);
