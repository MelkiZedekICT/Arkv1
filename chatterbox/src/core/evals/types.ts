export interface EvalCase {
  id: string;
  name: string;
  goal: string;
  mode: 'mock' | 'real';
  workspaceFixture: string;
  expectedFiles: string[];
  mustNotModify: string[];
  forbiddenFiles: string[];
  successCriteria: string[];
}

export interface GraderResult {
  grader: string;
  passed: boolean;
  score: number; // 0 or 1
  details: string;
}

export interface EvalCaseResult {
  caseId: string;
  name: string;
  success: boolean;
  durationMs: number;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  };
  diffAccepted: boolean;
  testsPassed: boolean;
  interventions: number;
  protectedPathViolations: number;
  graders: GraderResult[];
  error?: string;
}

export interface EvalReport {
  timestamp: string;
  totalCases: number;
  passedCases: number;
  taskSuccessRate: number; // 0.0 to 1.0
  diffAcceptanceRate: number;
  testPassRate: number;
  averageInterventions: number;
  averageDurationMs: number;
  totalTokens: number;
  totalEstimatedCostUsd: number;
  protectedPathViolations: number;
  caseResults: EvalCaseResult[];
}
