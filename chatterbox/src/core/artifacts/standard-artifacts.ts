import { z } from 'zod';
import { UnifiedDiff } from '../agents/schemas/coding-schemas.js';

export interface ChangeSummaryInput {
  goal: string;
  summaryOfChanges: string[];
  filesChanged: string[];
  filesCreated: string[];
  filesDeleted: string[];
  implementationDetails: string[];
  testResults: {
    command: string;
    exitCode: number;
    passedCount: number;
    failedCount: number;
    skippedCount: number;
    durationMs: number;
    summary?: string;
  };
  manualReviewChecklist: string[];
  risksAndLimitations: string[];
  howToReview: string[];
  taskWorktreeOrBranch?: string;
}

export interface TestReportInput {
  command: string;
  exitCode: number;
  durationMs: number;
  testsPassed: number;
  testsFailed: number;
  testsSkipped: number;
  relevantFailureOutput?: string;
  interpretation: string;
  requiredFollowUp?: string;
  agentId?: string;
  taskTitle?: string;
}

export const StandardArtifactSchemas = {
  changeSummary: z.object({
    goal: z.string().min(1),
    summaryOfChanges: z.array(z.string()),
    filesChanged: z.array(z.string()),
    filesCreated: z.array(z.string()),
    filesDeleted: z.array(z.string()),
    implementationDetails: z.array(z.string()),
    testResults: z.object({
      command: z.string(),
      exitCode: z.number(),
      passedCount: z.number(),
      failedCount: z.number(),
      skippedCount: z.number(),
      durationMs: z.number(),
      summary: z.string().optional(),
    }),
    manualReviewChecklist: z.array(z.string()),
    risksAndLimitations: z.array(z.string()),
    howToReview: z.array(z.string()),
  }),
  testReport: z.object({
    command: z.string(),
    exitCode: z.number(),
    durationMs: z.number(),
    testsPassed: z.number(),
    testsFailed: z.number(),
    testsSkipped: z.number(),
    interpretation: z.string(),
    relevantFailureOutput: z.string().optional(),
    requiredFollowUp: z.string().optional(),
  }),
};

export class StandardArtifactService {
  static readonly REQUIRED_CHANGE_SUMMARY_SECTIONS = [
    '# Change Summary',
    '## Goal',
    '## Summary of changes',
    '## Files changed',
    '## Files created',
    '## Files deleted',
    '## Implementation details',
    '## Test results',
    '## Manual review checklist',
    '## Risks and limitations',
    '## How to review',
    '## How to revert',
  ];

  static readonly REQUIRED_TEST_REPORT_ITEMS = [
    'Command executed',
    'Exit code',
    'Duration',
    'Tests passed',
    'Tests failed',
    'Tests skipped',
    'Interpretation',
    'Required follow-up',
  ];

  /**
   * Formats a standardized change-summary.md document.
   */
  static formatChangeSummary(input: ChangeSummaryInput): string {
    const formatList = (items: string[], fallback = '- None') =>
      items.length > 0 ? items.map((i) => (i.startsWith('-') ? i : `- ${i}`)).join('\n') : fallback;

    const allAffectedFiles = [
      ...input.filesChanged,
      ...input.filesCreated,
      ...input.filesDeleted,
    ];

    let revertInstructions: string;
    if (input.taskWorktreeOrBranch) {
      revertInstructions = `- If using task worktree or branch:\n  git worktree remove ${input.taskWorktreeOrBranch}\n  or git branch -D ${input.taskWorktreeOrBranch}`;
    } else if (allAffectedFiles.length > 0) {
      revertInstructions = `- Restore specific files altered by this task:\n  git checkout HEAD -- ${allAffectedFiles.map((f) => `"${f}"`).join(' ')}`;
    } else {
      revertInstructions = `- Revert task branch or checkout previous commit HEAD without blanket git restore: git checkout <previous-commit-sha>`;
    }

    return `# Change Summary

## Goal
${input.goal}

## Summary of changes
${formatList(input.summaryOfChanges)}

## Files changed
${formatList(input.filesChanged)}

## Files created
${formatList(input.filesCreated)}

## Files deleted
${formatList(input.filesDeleted)}

## Implementation details
${formatList(input.implementationDetails)}

## Test results
- Command executed: \`${input.testResults.command}\`
- Exit code: ${input.testResults.exitCode}
- Tests passed: ${input.testResults.passedCount}
- Tests failed: ${input.testResults.failedCount}
- Tests skipped: ${input.testResults.skippedCount}
- Duration: ${(input.testResults.durationMs / 1000).toFixed(2)}s
- Summary: ${input.testResults.summary || (input.testResults.exitCode === 0 ? 'All tests passed' : 'Failures detected')}

## Manual review checklist
${formatList(input.manualReviewChecklist)}

## Risks and limitations
${formatList(input.risksAndLimitations)}

## How to review
${formatList(input.howToReview)}

## How to revert
${revertInstructions}
`;
  }

  /**
   * Formats a standardized test-report.md document.
   */
  static formatTestReport(input: TestReportInput): string {
    const outcome = input.exitCode === 0 && input.testsFailed === 0 ? 'PASSED' : 'FAILED';
    const failureOutputBlock = input.relevantFailureOutput
      ? `\n\`\`\`text\n${input.relevantFailureOutput.trim()}\n\`\`\`\n`
      : '\nNo failure output recorded.\n';

    return `# Test Report${input.taskTitle ? `: ${input.taskTitle}` : ''}

## Execution Summary
- Command executed: \`${input.command}\`
- Exit code: ${input.exitCode} (${outcome})
- Duration: ${(input.durationMs / 1000).toFixed(2)}s
- Tests passed: ${input.testsPassed}
- Tests failed: ${input.testsFailed}
- Tests skipped: ${input.testsSkipped}

## Relevant failure output
${failureOutputBlock}

## Interpretation
${input.interpretation}

## Required follow-up
${input.requiredFollowUp || (outcome === 'PASSED' ? 'None. All suites verified.' : 'Investigate failing assertions and address regressions.')}
`;
  }

  /**
   * Formats combined unified diff for applied changeset.
   */
  static formatCombinedDiff(diffs: UnifiedDiff[]): string {
    if (diffs.length === 0) return '';
    return diffs
      .map((d) => {
        if (d.unifiedDiff && d.unifiedDiff.trim().length > 0) {
          return d.unifiedDiff.trim();
        }
        return '';
      })
      .filter((d) => d.length > 0)
      .join('\n\n') + '\n';
  }

  /**
   * Validates structure of change-summary.md against required headers.
   */
  static validateChangeSummary(content: string): { valid: boolean; missingSections: string[] } {
    const missingSections: string[] = [];
    for (const section of this.REQUIRED_CHANGE_SUMMARY_SECTIONS) {
      if (!content.includes(section)) {
        missingSections.push(section);
      }
    }

    // Safety check: Ensure no unsafe blanket rollback recommendation
    const hasUnsafeRollback = /git\s+restore\s+\./i.test(content);
    if (hasUnsafeRollback) {
      missingSections.push('SAFE_ROLLBACK_VIOLATION: "git restore ." must not be recommended');
    }

    return {
      valid: missingSections.length === 0,
      missingSections,
    };
  }

  /**
   * Validates structure of test-report.md against required content fields.
   */
  static validateTestReport(content: string): { valid: boolean; missingFields: string[] } {
    const missingFields: string[] = [];
    for (const item of this.REQUIRED_TEST_REPORT_ITEMS) {
      const regex = new RegExp(item, 'i');
      if (!regex.test(content)) {
        missingFields.push(item);
      }
    }
    return {
      valid: missingFields.length === 0,
      missingFields,
    };
  }
}
