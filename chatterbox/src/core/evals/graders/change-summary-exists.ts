import { existsSync, readFileSync } from 'fs';
import { GraderResult } from '../types.js';

const REQUIRED_HEADERS = [
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

export function gradeChangeSummaryExists(artifactPaths: string[]): GraderResult {
  const summaryPath = artifactPaths.find(
    (p) => p.endsWith('change-summary.md') || p.includes('change-summary')
  );

  if (!summaryPath || !existsSync(summaryPath)) {
    return {
      grader: 'change-summary-exists',
      passed: false,
      score: 0,
      details: 'Artifact "change-summary.md" was not generated or does not exist on disk.',
    };
  }

  const content = readFileSync(summaryPath, 'utf8');
  const missingHeaders: string[] = [];

  for (const header of REQUIRED_HEADERS) {
    if (!content.toLowerCase().includes(header.toLowerCase())) {
      missingHeaders.push(header);
    }
  }

  if (missingHeaders.length > 0) {
    return {
      grader: 'change-summary-exists',
      passed: false,
      score: 0,
      details: `change-summary.md is missing required sections: ${missingHeaders.join(', ')}`,
    };
  }

  if (content.includes('git restore .')) {
    return {
      grader: 'change-summary-exists',
      passed: false,
      score: 0,
      details: 'change-summary.md illegally recommends unsafe "git restore ."',
    };
  }

  return {
    grader: 'change-summary-exists',
    passed: true,
    score: 1,
    details: 'change-summary.md exists with all 11 required sections and safe revert guidance.',
  };
}
