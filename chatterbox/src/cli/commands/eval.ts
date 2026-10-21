import { Command } from 'commander';
import { EvalRunner } from '../../core/evals/index.js';
import { logger } from '../../utils/logger.js';

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

export const evalCommand = new Command('eval')
  .description('Evaluation harness for testing coding agents and benchmark tasks');

evalCommand
  .command('run')
  .description('Run evaluation benchmarks and generate performance report')
  .option('--case <caseId>', 'Run a specific evaluation case by ID')
  .option('--mock', 'Run in mock mode without API keys (default: true)', true)
  .action(async (options: { case?: string; mock?: boolean }) => {
    try {
      logger.info(bold(cyan('\n--- Chatterbox / AgentFeed Evaluation Suite ---\n')));
      const runner = new EvalRunner();
      const report = await runner.runAll(options.case, { forceMock: options.mock !== false });

      logger.info(bold('Benchmark Results:'));
      for (const res of report.caseResults) {
        const status = res.success ? green('✓ PASS') : red('✗ FAIL');
        logger.info(`  ${status} ${bold(res.name)} (${dim(res.caseId)}) - ${res.durationMs}ms`);
        for (const g of res.graders) {
          const gStatus = g.passed ? green('  ✓') : red('  ✗');
          logger.info(`    ${gStatus} ${dim(g.grader)}: ${g.details}`);
        }
      }

      logger.info(bold('\nAggregate Evaluation Metrics:'));
      logger.info(`  Task Success Rate:         ${(report.taskSuccessRate * 100).toFixed(1)}% (${report.passedCases}/${report.totalCases})`);
      logger.info(`  Diff Acceptance Rate:      ${(report.diffAcceptanceRate * 100).toFixed(1)}%`);
      logger.info(`  Test Pass Rate:            ${(report.testPassRate * 100).toFixed(1)}%`);
      logger.info(`  Average Duration:          ${(report.averageDurationMs / 1000).toFixed(2)}s`);
      logger.info(`  Total Tokens:              ${report.totalTokens}`);
      logger.info(`  Total Estimated Cost:      $${report.totalEstimatedCostUsd.toFixed(4)}`);
      logger.info(`  Protected Path Violations: ${report.protectedPathViolations === 0 ? green('0 (PASS)') : red(`${report.protectedPathViolations} (FAIL)`)}`);
      logger.info(`\nReport saved to: ${cyan('.chatterbox/eval-report.json')}\n`);
    } catch (err) {
      logger.error('Failed to run evals', err);
      process.exit(1);
    }
  });

evalCommand
  .command('report')
  .description('Display latest evaluation benchmark report')
  .action(async () => {
    try {
      const runner = new EvalRunner();
      const report = runner.getLatestReport();

      if (!report) {
        logger.info(yellow('\nNo evaluation report found. Run "agentfeed eval run" first.\n'));
        return;
      }

      logger.info(bold(cyan(`\n--- Latest Evaluation Report (${report.timestamp}) ---\n`)));
      logger.info(`  Total Cases Evaluated:     ${report.totalCases}`);
      logger.info(`  Cases Passed:              ${report.passedCases}/${report.totalCases} (${(report.taskSuccessRate * 100).toFixed(1)}%)`);
      logger.info(`  Diff Acceptance Rate:      ${(report.diffAcceptanceRate * 100).toFixed(1)}%`);
      logger.info(`  Test Pass Rate:            ${(report.testPassRate * 100).toFixed(1)}%`);
      logger.info(`  Average Duration:          ${(report.averageDurationMs / 1000).toFixed(2)}s`);
      logger.info(`  Total Tokens:              ${report.totalTokens}`);
      logger.info(`  Total Estimated Cost:      $${report.totalEstimatedCostUsd.toFixed(4)}`);
      logger.info(`  Protected Path Violations: ${report.protectedPathViolations === 0 ? green('0 (PASS)') : red(`${report.protectedPathViolations} (FAIL)`)}`);
      logger.info('');
    } catch (err) {
      logger.error('Failed to display eval report', err);
      process.exit(1);
    }
  });
