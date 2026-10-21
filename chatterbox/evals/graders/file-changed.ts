import { existsSync } from 'fs';
import { resolve } from 'path';
import { GraderResult, EvalCase } from '../types.js';

export function gradeFileChanged(workspaceRoot: string, evalCase: EvalCase): GraderResult {
  const missingFiles: string[] = [];

  for (const expected of evalCase.expectedFiles) {
    const absPath = resolve(workspaceRoot, expected);
    if (!existsSync(absPath)) {
      missingFiles.push(expected);
    }
  }

  const passed = missingFiles.length === 0;
  return {
    grader: 'file-changed',
    passed,
    score: passed ? 1 : 0,
    details: passed
      ? `All ${evalCase.expectedFiles.length} expected files exist in workspace.`
      : `Missing expected files: ${missingFiles.join(', ')}`,
  };
}
