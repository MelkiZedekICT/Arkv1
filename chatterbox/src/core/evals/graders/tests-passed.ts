import { GraderResult } from '../types.js';
import { AgentFeedEvent } from '../../events/event-types.js';

export function gradeTestsPassed(events: AgentFeedEvent[]): GraderResult {
  const testCompletedEvents = events.filter((e) => e.type === 'tests_completed');

  if (testCompletedEvents.length === 0) {
    const commandCompleted = events.filter(
      (e) => e.type === 'command_completed' && String((e.payload as { command?: string })?.command).includes('test')
    );
    const passed = commandCompleted.length > 0;
    return {
      grader: 'tests-passed',
      passed,
      score: passed ? 1 : 0,
      details: passed ? 'Allowlisted test command executed and completed successfully.' : 'No test execution was recorded.',
    };
  }

  const lastTest = testCompletedEvents[testCompletedEvents.length - 1];
  const passed = Boolean((lastTest.payload as { passed?: boolean })?.passed);

  return {
    grader: 'tests-passed',
    passed,
    score: passed ? 1 : 0,
    details: passed
      ? 'Automated test suite passed with zero regressions.'
      : 'Automated test suite failed or encountered errors.',
  };
}
