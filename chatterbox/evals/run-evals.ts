import { EvalRunner } from '../src/core/evals/index.js';

async function main() {
  const caseFilter = process.argv[2];
  const runner = new EvalRunner();
  const report = await runner.runAll(caseFilter);
  console.log(`\n=== Eval Run Finished ===`);
  console.log(`Success Rate: ${(report.taskSuccessRate * 100).toFixed(1)}% (${report.passedCases}/${report.totalCases})`);
  console.log(`Diff Acceptance Rate: ${(report.diffAcceptanceRate * 100).toFixed(1)}%`);
  console.log(`Test Pass Rate: ${(report.testPassRate * 100).toFixed(1)}%`);
  console.log(`Protected Path Violations: ${report.protectedPathViolations}`);
  console.log(`Average Duration: ${(report.averageDurationMs / 1000).toFixed(2)}s\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
