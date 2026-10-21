import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { QualityGateService } from '../../src/core/security/quality-gates.js';
import { AgentFeedEvent } from '../../src/core/events/event-types.js';
import { EventBus } from '../../src/core/events/event-bus.js';
import { StandardArtifactService } from '../../src/core/artifacts/standard-artifacts.js';
import { UnifiedDiff } from '../../src/core/agents/schemas/coding-schemas.js';

describe('Milestone 10 Phase 4: QualityGateService & Standardized Artifacts', () => {
  let tempWs: string;
  let eventBus: EventBus;

  beforeEach(() => {
    tempWs = mkdtempSync(join(tmpdir(), 'phase4-ws-'));
    eventBus = new EventBus();
  });

  afterEach(() => {
    try {
      rmSync(tempWs, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  function createValidArtifacts(ws: string) {
    const summaryPath = join(ws, 'change-summary.md');
    const diffPath = join(ws, 'changes.diff');
    const reportPath = join(ws, 'test-report.md');

    const validSummary = StandardArtifactService.formatChangeSummary({
      goal: 'Implement user validation helper',
      summaryOfChanges: ['Created validation module', 'Added unit tests'],
      filesChanged: [],
      filesCreated: ['src/validation.ts', 'tests/validation.test.ts'],
      filesDeleted: [],
      implementationDetails: ['Safe type checks', 'Unit assertions'],
      testResults: {
        command: 'pnpm test',
        exitCode: 0,
        passedCount: 2,
        failedCount: 0,
        skippedCount: 0,
        durationMs: 450,
        summary: 'All tests passed cleanly',
      },
      manualReviewChecklist: ['Verify TypeScript types', 'Check edge cases'],
      risksAndLimitations: ['Low risk: new module'],
      howToReview: ['Inspect changes.diff'],
      taskWorktreeOrBranch: 'task-branch-feat',
    });

    const validReport = StandardArtifactService.formatTestReport({
      command: 'pnpm test',
      exitCode: 0,
      durationMs: 450,
      testsPassed: 2,
      testsFailed: 0,
      testsSkipped: 0,
      interpretation: 'All test assertions succeeded with zero regressions.',
      taskTitle: 'Validation Test Suite',
    });

    const validDiff = `--- /dev/null
+++ b/src/validation.ts
@@ -0,0 +1,4 @@
+export function validate(val: unknown): boolean {
+  return typeof val === 'object' && val !== null;
+}
`;

    writeFileSync(summaryPath, validSummary, 'utf8');
    writeFileSync(diffPath, validDiff, 'utf8');
    writeFileSync(reportPath, validReport, 'utf8');

    return { summaryPath, diffPath, reportPath };
  }

  function createValidEvents(): AgentFeedEvent[] {
    const now = new Date().toISOString();
    return [
      {
        eventId: 'evt_1',
        taskId: 'task_qg',
        type: 'diff_proposed',
        timestamp: now,
        actorType: 'agent',
        actorId: 'agent_coder',
        correlationId: 'c1',
        payload: { filePath: 'src/validation.ts' },
      },
      {
        eventId: 'evt_2',
        taskId: 'task_qg',
        type: 'diff_approved',
        timestamp: now,
        actorType: 'user',
        actorId: 'reviewer',
        correlationId: 'c1',
        payload: { filePath: 'src/validation.ts' },
      },
      {
        eventId: 'evt_3',
        taskId: 'task_qg',
        type: 'diff_applied',
        timestamp: now,
        actorType: 'agent',
        actorId: 'agent_coder',
        correlationId: 'c1',
        payload: { filePath: 'src/validation.ts' },
      },
      {
        eventId: 'evt_4',
        taskId: 'task_qg',
        type: 'tests_started',
        timestamp: now,
        actorType: 'agent',
        actorId: 'agent_tester',
        correlationId: 'c1',
        payload: { testCommand: 'pnpm test' },
      },
      {
        eventId: 'evt_5',
        taskId: 'task_qg',
        type: 'tests_completed',
        timestamp: now,
        actorType: 'agent',
        actorId: 'agent_tester',
        correlationId: 'c1',
        payload: { testCommand: 'pnpm test', passed: true },
      },
    ];
  }

  // 1. Passes when all quality gates are satisfied
  it('passes all 13 quality gates for fully compliant task execution', async () => {
    const { summaryPath, diffPath, reportPath } = createValidArtifacts(tempWs);
    const events = createValidEvents();

    let passedEmitted = false;
    eventBus.subscribe('quality_gate_passed', () => {
      passedEmitted = true;
    });

    const result = await QualityGateService.evaluate({
      taskId: 'task_qg',
      workspaceRoot: tempWs,
      events,
      artifactPaths: [summaryPath, diffPath, reportPath],
      eventBus,
    });

    expect(result.passed).toBe(true);
    expect(result.failedGates).toEqual([]);
    expect(result.suggestedStatus).toBe('done');
    expect(passedEmitted).toBe(true);
  });

  // 2. Quality gates detect missing changeset
  it('1. Quality gates detect missing changeset', async () => {
    const { summaryPath, diffPath, reportPath } = createValidArtifacts(tempWs);
    const events = createValidEvents().filter(
      (e) => e.type !== 'diff_proposed' && e.type !== 'changeset_proposed'
    );

    const result = await QualityGateService.evaluate({
      taskId: 'task_qg',
      workspaceRoot: tempWs,
      events,
      artifactPaths: [summaryPath, diffPath, reportPath],
      eventBus,
    });

    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('diff_proposed');
    expect(result.suggestedStatus).toBe('review');
    expect(result.reasons.some((r) => r.includes('Gate 1 Failed'))).toBe(true);
  });

  // 3. Quality gates detect unapplied approved changeset
  it('2. Quality gates detect unapplied approved changeset', async () => {
    const { summaryPath, diffPath, reportPath } = createValidArtifacts(tempWs);
    const events = createValidEvents().filter(
      (e) => e.type !== 'diff_applied' && e.type !== 'changeset_applied'
    );

    const result = await QualityGateService.evaluate({
      taskId: 'task_qg',
      workspaceRoot: tempWs,
      events,
      artifactPaths: [summaryPath, diffPath, reportPath],
      eventBus,
    });

    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('diff_applied');
    expect(result.reasons.some((r) => r.includes('Gate 3 Failed'))).toBe(true);
  });

  // 4. Quality gates detect stale changeset
  it('3. Quality gates detect stale changeset', async () => {
    const { summaryPath, diffPath, reportPath } = createValidArtifacts(tempWs);
    const events = [
      ...createValidEvents(),
      {
        eventId: 'evt_stale',
        taskId: 'task_qg',
        type: 'diff_stale' as const,
        timestamp: new Date().toISOString(),
        actorType: 'system' as const,
        actorId: 'stale_detector',
        correlationId: 'c1',
        payload: { filePath: 'src/validation.ts', reason: 'File changed on disk' },
      },
    ];

    const result = await QualityGateService.evaluate({
      taskId: 'task_qg',
      workspaceRoot: tempWs,
      events,
      artifactPaths: [summaryPath, diffPath, reportPath],
      eventBus,
    });

    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('no_stale_diffs_applied');
    expect(result.suggestedStatus).toBe('blocked');
    expect(result.reasons.some((r) => r.includes('Gate 4 Failed'))).toBe(true);
  });

  // 5. Quality gates detect protected-path modification
  it('4. Quality gates detect protected-path modification', async () => {
    const { summaryPath, diffPath, reportPath } = createValidArtifacts(tempWs);
    const events = [
      ...createValidEvents(),
      {
        eventId: 'evt_prot',
        taskId: 'task_qg',
        type: 'diff_proposed' as const,
        timestamp: new Date().toISOString(),
        actorType: 'agent' as const,
        actorId: 'agent_coder',
        correlationId: 'c1',
        payload: { filePath: '.env' },
      },
    ];

    const result = await QualityGateService.evaluate({
      taskId: 'task_qg',
      workspaceRoot: tempWs,
      events,
      artifactPaths: [summaryPath, diffPath, reportPath],
      eventBus,
    });

    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('no_protected_paths_modified');
    expect(result.suggestedStatus).toBe('blocked');
  });

  // 6. Quality gates detect missing change summary
  it('5. Quality gates detect missing change summary', async () => {
    const { diffPath, reportPath } = createValidArtifacts(tempWs);
    const events = createValidEvents();

    const result = await QualityGateService.evaluate({
      taskId: 'task_qg',
      workspaceRoot: tempWs,
      events,
      artifactPaths: [diffPath, reportPath], // change-summary omitted
      eventBus,
    });

    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('change_summary_exists');
    expect(result.suggestedStatus).toBe('review');
  });

  // 7. Quality gates detect missing diff artifact
  it('6. Quality gates detect missing diff artifact', async () => {
    const { summaryPath, reportPath } = createValidArtifacts(tempWs);
    const events = createValidEvents();

    const result = await QualityGateService.evaluate({
      taskId: 'task_qg',
      workspaceRoot: tempWs,
      events,
      artifactPaths: [summaryPath, reportPath], // changes.diff omitted
      eventBus,
    });

    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('changes_diff_exists');
    expect(result.suggestedStatus).toBe('review');
  });

  // 8. Quality gates detect missing test report when tests ran
  it('7. Quality gates detect missing test report when tests ran', async () => {
    const { summaryPath, diffPath } = createValidArtifacts(tempWs);
    const events = createValidEvents(); // includes tests_started

    const result = await QualityGateService.evaluate({
      taskId: 'task_qg',
      workspaceRoot: tempWs,
      events,
      artifactPaths: [summaryPath, diffPath], // test-report omitted
      eventBus,
    });

    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('test_report_exists');
    expect(result.suggestedStatus).toBe('review');
  });

  // 9. Quality gates detect placeholder text
  it('8. Quality gates detect placeholder text (TODO, FIXME, Lorem ipsum, your code here)', async () => {
    const { summaryPath, diffPath, reportPath } = createValidArtifacts(tempWs);
    const events = createValidEvents();

    writeFileSync(
      summaryPath,
      '# Change Summary\n\n## Goal\nTest\n\n## Implementation\nTODO: write real code here\n',
      'utf8'
    );

    const result = await QualityGateService.evaluate({
      taskId: 'task_qg',
      workspaceRoot: tempWs,
      events,
      artifactPaths: [summaryPath, diffPath, reportPath],
      eventBus,
    });

    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('no_placeholders');
    expect(result.reasons.some((r) => r.includes('TODO'))).toBe(true);
  });

  // 10. Quality gates detect secrets in artifacts
  it('9. Quality gates detect secrets in artifacts and event payloads', async () => {
    const { summaryPath, diffPath, reportPath } = createValidArtifacts(tempWs);
    const events = createValidEvents();

    writeFileSync(
      summaryPath,
      '# Change Summary\n\napiKey = "sk-live123456789012345678901234"\n',
      'utf8'
    );

    const result = await QualityGateService.evaluate({
      taskId: 'task_qg',
      workspaceRoot: tempWs,
      events,
      artifactPaths: [summaryPath, diffPath, reportPath],
      eventBus,
    });

    expect(result.passed).toBe(false);
    expect(result.failedGates).toContain('no_secrets_leaked');
    expect(result.suggestedStatus).toBe('blocked');
  });

  // 11. Task does not complete when a quality gate fails
  it('10. Task does not complete when a quality gate fails and emits quality_gate_failed', async () => {
    const { summaryPath, diffPath, reportPath } = createValidArtifacts(tempWs);
    const events = createValidEvents().filter(
      (e) => e.type !== 'diff_approved' && e.type !== 'changeset_approved'
    );

    let failedEmitted = false;
    let failurePayload: Record<string, unknown> | null = null;
    eventBus.subscribe('quality_gate_failed', (evt) => {
      failedEmitted = true;
      failurePayload = evt.payload as Record<string, unknown>;
    });

    const result = await QualityGateService.evaluate({
      taskId: 'task_qg',
      workspaceRoot: tempWs,
      events,
      artifactPaths: [summaryPath, diffPath, reportPath],
      eventBus,
    });

    expect(result.passed).toBe(false);
    expect(result.suggestedStatus).not.toBe('done');
    expect(failedEmitted).toBe(true);
    expect(failurePayload?.failedGates).toBeDefined();
    expect(failurePayload?.actionableNextSteps).toBeDefined();
  });

  // 12. change-summary.md follows required structure and rejects blanket git restore .
  it('11. change-summary.md follows required structure and rejects blanket "git restore ."', () => {
    const validSummary = StandardArtifactService.formatChangeSummary({
      goal: 'Add logging helper',
      summaryOfChanges: ['Created logger.ts'],
      filesChanged: [],
      filesCreated: ['src/logger.ts'],
      filesDeleted: [],
      implementationDetails: ['Safe console wrapper'],
      testResults: {
        command: 'pnpm test',
        exitCode: 0,
        passedCount: 1,
        failedCount: 0,
        skippedCount: 0,
        durationMs: 120,
      },
      manualReviewChecklist: ['Checked formatting'],
      risksAndLimitations: ['None'],
      howToReview: ['Inspect changes.diff'],
      taskWorktreeOrBranch: 'worktree-branch',
    });

    const validation = StandardArtifactService.validateChangeSummary(validSummary);
    expect(validation.valid).toBe(true);
    expect(validation.missingSections).toEqual([]);

    for (const section of StandardArtifactService.REQUIRED_CHANGE_SUMMARY_SECTIONS) {
      expect(validSummary).toContain(section);
    }

    // Unsafe rollback recommendation rejection
    const unsafeSummary = validSummary + '\n\n## How to revert\ngit restore .\n';
    const unsafeValidation = StandardArtifactService.validateChangeSummary(unsafeSummary);
    expect(unsafeValidation.valid).toBe(false);
    expect(unsafeValidation.missingSections.some((s) => s.includes('SAFE_ROLLBACK_VIOLATION'))).toBe(true);
  });

  // 13. changes.diff contains the applied unified diff
  it('12. changes.diff contains the applied unified diff with additions and deletions', () => {
    const sampleDiffs: UnifiedDiff[] = [
      {
        filePath: 'src/index.ts',
        changeType: 'modify',
        unifiedDiff: `--- a/src/index.ts
+++ b/src/index.ts
@@ -1,2 +1,3 @@
 const x = 1;
+const y = 2;
`,
        additions: 1,
        deletions: 0,
      },
      {
        filePath: 'src/new-file.ts',
        changeType: 'create',
        unifiedDiff: `--- /dev/null
+++ b/src/new-file.ts
@@ -0,0 +1,3 @@
+export const hello = 'world';
`,
        additions: 3,
        deletions: 0,
      },
    ];

    const combined = StandardArtifactService.formatCombinedDiff(sampleDiffs);
    expect(combined).toContain('--- a/src/index.ts');
    expect(combined).toContain('+++ b/src/index.ts');
    expect(combined).toContain('+++ b/src/new-file.ts');
    expect(combined).toContain('+const y = 2;');
  });

  // 14. test-report.md contains command, exit code, counts, and duration
  it('13. test-report.md contains command, exit code, counts, and duration', () => {
    const reportContent = StandardArtifactService.formatTestReport({
      command: 'pnpm test --run',
      exitCode: 0,
      durationMs: 1420,
      testsPassed: 12,
      testsFailed: 0,
      testsSkipped: 1,
      interpretation: 'All unit test suites completed cleanly with no regressions.',
      requiredFollowUp: 'None required.',
    });

    const validation = StandardArtifactService.validateTestReport(reportContent);
    expect(validation.valid).toBe(true);
    expect(validation.missingFields).toEqual([]);

    expect(reportContent).toContain('Command executed: `pnpm test --run`');
    expect(reportContent).toContain('Exit code: 0');
    expect(reportContent).toContain('Duration: 1.42s');
    expect(reportContent).toContain('Tests passed: 12');
    expect(reportContent).toContain('Tests failed: 0');
    expect(reportContent).toContain('Tests skipped: 1');
  });

  // 15. No secrets appear in logs, events, artifacts, errors, or test snapshots
  it('18. No secrets appear in logs, events, artifacts, errors, or test snapshots', async () => {
    const { summaryPath, diffPath, reportPath } = createValidArtifacts(tempWs);
    const events = createValidEvents();

    const result = await QualityGateService.evaluate({
      taskId: 'task_qg',
      workspaceRoot: tempWs,
      events,
      artifactPaths: [summaryPath, diffPath, reportPath],
      eventBus,
    });

    expect(result.checks.noSecretsLeaked).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
    expect(JSON.stringify(result)).not.toMatch(/AIzaSy[a-zA-Z0-9_-]{33}/);
    expect(JSON.stringify(result)).not.toMatch(/-----BEGIN (?:RSA )?PRIVATE KEY-----/);
  });
});
