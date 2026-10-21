import { existsSync, readFileSync } from 'fs';
import { PathGuard } from '../workspace/path-guard.js';
import { AgentFeedEvent } from '../events/event-types.js';
import { EventBus } from '../events/event-bus.js';
import { generateId } from '../../utils/ids.js';
import { getTimestamp } from '../../utils/time.js';
import { StandardArtifactService } from '../artifacts/standard-artifacts.js';

export interface QualityGateEvaluationInput {
  taskId: string;
  workspaceRoot: string;
  events: AgentFeedEvent[];
  artifactPaths: string[];
  eventBus?: EventBus;
}

export interface QualityGateCheckResults {
  diffProposed: boolean;
  diffApproved: boolean;
  diffApplied: boolean;
  noStaleDiffsApplied: boolean;
  pathsInsideWorkspace: boolean;
  noProtectedPathsModified: boolean;
  allApprovedDiffsApplied: boolean;
  testsPassedOrExplained: boolean;
  changeSummaryExists: boolean;
  changesDiffExists: boolean;
  testReportExists: boolean;
  noPlaceholders: boolean;
  noSecretsLeaked: boolean;
}

export interface QualityGateResult {
  passed: boolean;
  failedGates: string[];
  reasons: string[];
  actionableNextSteps: string[];
  suggestedStatus: 'done' | 'review' | 'blocked';
  checks: QualityGateCheckResults;
}

const PLACEHOLDER_PATTERN = /\b(TODO|FIXME|Lorem ipsum|your code here)\b/i;

const SECRET_PATTERNS = [
  /(?:sk-[a-zA-Z0-9]{20,})/i,
  /(?:ghp_[a-zA-Z0-9]{20,})/i,
  /(?:AIzaSy[a-zA-Z0-9_-]{33})/i,
  /(?:xox[baprs]-[0-9a-zA-Z]{10,48})/i,
  /(?:AKIA[0-9A-Z]{16})/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /(?:password|api_key|secret_key|private_key)\s*[:=]\s*['"][^'"]{8,}['"]/i,
  /Bearer\s+[a-zA-Z0-9_.-]{20,}/i,
];

export class QualityGateService {
  /**
   * Evaluates all 13 quality gates for a completed or concluding coding task.
   */
  static async evaluate(input: QualityGateEvaluationInput): Promise<QualityGateResult> {
    const { taskId, workspaceRoot, events, artifactPaths, eventBus } = input;
    const reasons: string[] = [];
    const failedGates: string[] = [];
    const actionableNextSteps: string[] = [];

    // Helper to find artifact file on disk
    const findArtifactPath = (name: string): string | undefined => {
      return artifactPaths.find((p) => p.endsWith(name) || p.includes(name));
    };

    // 1. Check if at least one diff or changeset was proposed
    const diffProposedEvents = events.filter(
      (e) => e.type === 'diff_proposed' || e.type === 'changeset_proposed'
    );
    const diffProposed = diffProposedEvents.length > 0;
    if (!diffProposed) {
      failedGates.push('diff_proposed');
      reasons.push('Gate 1 Failed: No changeset or diff was proposed during task execution.');
      actionableNextSteps.push('Ensure the coder agent proposes a concrete changeset or diff.');
    }

    // 2. Check if at least one diff or changeset was approved
    const diffApprovedEvents = events.filter(
      (e) => e.type === 'diff_approved' || e.type === 'changeset_approved'
    );
    const diffApproved = diffApprovedEvents.length > 0;
    if (!diffApproved) {
      failedGates.push('diff_approved');
      reasons.push('Gate 2 Failed: No proposed changeset or diff was approved.');
      actionableNextSteps.push('Review and approve the proposed changeset before completing the task.');
    }

    // 3. Check if at least one diff or changeset was applied successfully
    const diffAppliedEvents = events.filter(
      (e) => e.type === 'diff_applied' || e.type === 'changeset_applied'
    );
    const diffApplied = diffAppliedEvents.length > 0;
    if (!diffApplied) {
      failedGates.push('diff_applied');
      reasons.push('Gate 3 Failed: No approved changeset or diff was applied successfully to the workspace.');
      actionableNextSteps.push('Execute changeset apply operation to write verified changes to disk.');
    }

    // 4. No changeset or diff is stale
    const staleEvents = events.filter(
      (e) => e.type === 'diff_stale' || e.type === 'changeset_stale'
    );
    const noStaleDiffsApplied = staleEvents.length === 0;
    if (!noStaleDiffsApplied) {
      failedGates.push('no_stale_diffs_applied');
      reasons.push('Gate 4 Failed: Stale changeset detected; target file was modified after diff generation.');
      actionableNextSteps.push('Rebase or regenerate the changeset against current workspace file contents.');
    }

    // 5. All proposed paths are inside workspace & 6. Zero protected paths accessed or modified
    let pathsInsideWorkspace = true;
    let noProtectedPathsModified = true;

    for (const evt of events) {
      const payload = evt.payload as Record<string, unknown>;
      const candidatePaths: string[] = [];

      if (typeof payload?.filePath === 'string') candidatePaths.push(payload.filePath);
      if (typeof payload?.path === 'string') candidatePaths.push(payload.path);
      if (Array.isArray(payload?.diffs)) {
        for (const d of payload.diffs) {
          if (typeof d?.filePath === 'string') candidatePaths.push(d.filePath);
        }
      }
      if (Array.isArray(payload?.operations)) {
        for (const op of payload.operations) {
          if (typeof op?.path === 'string') candidatePaths.push(op.path);
        }
      }

      for (const p of candidatePaths) {
        if (PathGuard.isProtected(p)) {
          noProtectedPathsModified = false;
          if (!failedGates.includes('no_protected_paths_modified')) {
            failedGates.push('no_protected_paths_modified');
            reasons.push(`Gate 6 Failed: Target path is a protected repository boundary: "${p}".`);
            actionableNextSteps.push(`Remove protected file references ("${p}") from changeset.`);
          }
        }

        try {
          PathGuard.resolveSafe(workspaceRoot, p, { allowProtected: true });
        } catch {
          pathsInsideWorkspace = false;
          if (!failedGates.includes('paths_inside_workspace')) {
            failedGates.push('paths_inside_workspace');
            reasons.push(`Gate 5 Failed: Target path escapes workspace root: "${p}".`);
            actionableNextSteps.push(`Adjust file path "${p}" so that it remains inside "${workspaceRoot}".`);
          }
        }
      }
    }

    // 7. All approved diffs applied successfully
    const diffApprovedCount = diffApprovedEvents.length;
    const diffAppliedCount = diffAppliedEvents.length;
    const allApprovedDiffsApplied = diffApprovedCount <= diffAppliedCount && diffAppliedCount > 0;
    if (diffApprovedCount > 0 && diffAppliedCount < diffApprovedCount) {
      failedGates.push('all_approved_diffs_applied');
      reasons.push(`Gate 7 Failed: Not all approved diffs were applied (${diffAppliedCount}/${diffApprovedCount}).`);
      actionableNextSteps.push('Ensure every approved file operation has been applied cleanly.');
    }

    // 8. Test command ran successfully, or failure is explicitly explained and task is not marked done
    const testStartedEvents = events.filter((e) => e.type === 'tests_started');
    const testCompletedEvents = events.filter((e) => e.type === 'tests_completed');
    let testsPassedOrExplained = true;

    if (testStartedEvents.length > 0) {
      if (testCompletedEvents.length === 0) {
        testsPassedOrExplained = false;
        failedGates.push('tests_passed_or_explained');
        reasons.push('Gate 8 Failed: Tests were started but never recorded completion.');
        actionableNextSteps.push('Wait for test execution to conclude or inspect test runner errors.');
      } else {
        const lastTest = testCompletedEvents[testCompletedEvents.length - 1];
        const passed = Boolean((lastTest.payload as { passed?: boolean })?.passed);
        if (!passed) {
          testsPassedOrExplained = false;
          failedGates.push('tests_passed_or_explained');
          reasons.push('Gate 8 Failed: Test execution failed without successful resolution.');
          actionableNextSteps.push('Resolve failing tests or address regressions reported by the test runner.');
        }
      }
    }

    // 9. Standard artifacts: change-summary.md exists and is valid
    const changeSummaryPath = findArtifactPath('change-summary.md');
    const changeSummaryExists = Boolean(changeSummaryPath);
    if (!changeSummaryExists) {
      failedGates.push('change_summary_exists');
      reasons.push('Gate 9 Failed: Required deliverable "change-summary.md" was not found in artifacts.');
      actionableNextSteps.push('Run reviewer agent to generate the standardized change-summary.md document.');
    } else if (changeSummaryPath && existsSync(changeSummaryPath)) {
      try {
        const summaryContent = readFileSync(changeSummaryPath, 'utf8');
        const validation = StandardArtifactService.validateChangeSummary(summaryContent);
        if (!validation.valid) {
          failedGates.push('change_summary_structure');
          reasons.push(`Gate 9 Failed: "change-summary.md" missing required sections: ${validation.missingSections.join(', ')}`);
          actionableNextSteps.push('Update change-summary.md to include all mandatory sections and safe rollback instructions.');
        }
      } catch {
        // ignore read error
      }
    }

    // 10. changes.diff exists
    const changesDiffPath = findArtifactPath('changes.diff');
    const changesDiffExists = Boolean(changesDiffPath);
    if (!changesDiffExists) {
      failedGates.push('changes_diff_exists');
      reasons.push('Gate 10 Failed: Required deliverable "changes.diff" was not found in artifacts.');
      actionableNextSteps.push('Generate a unified diff artifact (changes.diff) for the applied changes.');
    }

    // 11. test-report.md exists when tests were run
    let testReportExists = true;
    if (testStartedEvents.length > 0) {
      const testReportPath = findArtifactPath('test-report.md');
      testReportExists = Boolean(testReportPath);
      if (!testReportExists) {
        failedGates.push('test_report_exists');
        reasons.push('Gate 11 Failed: Test execution was recorded but "test-report.md" was not created.');
        actionableNextSteps.push('Generate test-report.md summarizing test command output, exit code, and counts.');
      } else if (testReportPath && existsSync(testReportPath)) {
        try {
          const reportContent = readFileSync(testReportPath, 'utf8');
          const validation = StandardArtifactService.validateTestReport(reportContent);
          if (!validation.valid) {
            failedGates.push('test_report_structure');
            reasons.push(`Gate 11 Failed: "test-report.md" missing required fields: ${validation.missingFields.join(', ')}`);
            actionableNextSteps.push('Ensure test-report.md contains command, exit code, duration, and test counts.');
          }
        } catch {
          // ignore read error
        }
      }
    }

    // 12. No placeholder text (TODO, FIXME, Lorem ipsum, your code here) in final artifacts
    let noPlaceholders = true;
    for (const artPath of artifactPaths) {
      if (existsSync(artPath)) {
        try {
          const content = readFileSync(artPath, 'utf8');
          // Allow checklists like "[x] No placeholder text (TODO, FIXME)" in code-review.md
          const sanitizedContent = content.replace(/\[[ x]\][^\n]+/gi, '');
          const match = sanitizedContent.match(PLACEHOLDER_PATTERN);
          if (match) {
            noPlaceholders = false;
            failedGates.push('no_placeholders');
            reasons.push(`Gate 12 Failed: Placeholder text "${match[0]}" detected in artifact "${artPath}".`);
            actionableNextSteps.push(`Remove placeholder phrase "${match[0]}" from artifact "${artPath}".`);
            break;
          }
        } catch {
          // ignore read error
        }
      }
    }

    // 13. No secrets leaked in artifacts or events
    let noSecretsLeaked = true;
    for (const artPath of artifactPaths) {
      if (existsSync(artPath)) {
        try {
          const content = readFileSync(artPath, 'utf8');
          for (const pattern of SECRET_PATTERNS) {
            if (pattern.test(content)) {
              noSecretsLeaked = false;
              failedGates.push('no_secrets_leaked');
              reasons.push(`Gate 13 Failed: Potential credential or secret pattern detected in artifact "${artPath}".`);
              actionableNextSteps.push(`Redact all secrets, keys, or tokens from artifact "${artPath}".`);
              break;
            }
          }
        } catch {
          // ignore
        }
      }
    }

    for (const evt of events) {
      const serialized = JSON.stringify(evt.payload || {});
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(serialized)) {
          noSecretsLeaked = false;
          if (!failedGates.includes('no_secrets_leaked')) {
            failedGates.push('no_secrets_leaked');
            reasons.push(`Gate 13 Failed: Potential credential or secret pattern detected in event payload (${evt.type}).`);
            actionableNextSteps.push(`Sanitize event payload for "${evt.type}" to ensure credentials are not logged.`);
          }
          break;
        }
      }
      if (!noSecretsLeaked) break;
    }

    const passed = failedGates.length === 0;

    // Determine suggested status:
    // Security or boundary violations (path escape, protected path, secrets leak, stale overwrite) -> blocked
    // Missing deliverables, approvals, test failure, placeholders -> review
    let suggestedStatus: 'done' | 'review' | 'blocked' = 'done';
    if (!passed) {
      const isSecurityOrIntegrity = failedGates.some((g) =>
        ['paths_inside_workspace', 'no_protected_paths_modified', 'no_secrets_leaked', 'no_stale_diffs_applied'].includes(g)
      );
      suggestedStatus = isSecurityOrIntegrity ? 'blocked' : 'review';
    }

    // Emit event on bus if provided
    if (eventBus) {
      if (passed) {
        await eventBus.publish({
          eventId: generateId('evt'),
          taskId,
          type: 'quality_gate_passed',
          timestamp: getTimestamp(),
          actorType: 'system',
          actorId: 'quality_gate_guard',
          correlationId: generateId('corr'),
          payload: {
            gatesEvaluatedCount: 13,
            suggestedStatus: 'done',
            checks: {
              diffProposed,
              diffApproved,
              diffApplied,
              noStaleDiffsApplied,
              pathsInsideWorkspace,
              noProtectedPathsModified,
              allApprovedDiffsApplied,
              testsPassedOrExplained,
              changeSummaryExists,
              changesDiffExists,
              testReportExists,
              noPlaceholders,
              noSecretsLeaked,
            },
          },
        });
      } else {
        await eventBus.publish({
          eventId: generateId('evt'),
          taskId,
          type: 'quality_gate_failed',
          timestamp: getTimestamp(),
          actorType: 'system',
          actorId: 'quality_gate_guard',
          correlationId: generateId('corr'),
          payload: {
            failedGates,
            reasons,
            actionableNextSteps,
            suggestedStatus,
          },
        });
      }
    }

    return {
      passed,
      failedGates,
      reasons,
      actionableNextSteps,
      suggestedStatus,
      checks: {
        diffProposed,
        diffApproved,
        diffApplied,
        noStaleDiffsApplied,
        pathsInsideWorkspace,
        noProtectedPathsModified,
        allApprovedDiffsApplied,
        testsPassedOrExplained,
        changeSummaryExists,
        changesDiffExists,
        testReportExists,
        noPlaceholders,
        noSecretsLeaked,
      },
    };
  }
}
