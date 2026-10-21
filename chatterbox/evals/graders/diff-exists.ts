import { GraderResult } from '../types.js';
import { AgentFeedEvent } from '../../src/core/events/event-types.js';

export function gradeDiffExists(events: AgentFeedEvent[], artifactPaths: string[]): GraderResult {
  const hasDiffEvent = events.some(
    (e) => e.type === 'diff_proposed' || e.type === 'changeset_proposed'
  );
  const hasDiffArtifact = artifactPaths.some(
    (p) => p.endsWith('changes.diff') || p.includes('changes.diff')
  );

  const passed = hasDiffEvent || hasDiffArtifact;
  return {
    grader: 'diff-exists',
    passed,
    score: passed ? 1 : 0,
    details: passed
      ? 'Verified proposed diff or changeset recorded in event log or artifacts.'
      : 'No diff or changeset was proposed during task execution.',
  };
}
