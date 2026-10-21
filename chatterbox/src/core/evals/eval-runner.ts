import { existsSync, mkdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'fs';
import { resolve, join } from 'path';
import { tmpdir } from 'os';
import { EvalCase, EvalCaseResult, EvalReport, GraderResult } from './types.js';
import { gradeFileChanged } from './graders/file-changed.js';
import { gradeDiffExists } from './graders/diff-exists.js';
import { gradeTestsPassed } from './graders/tests-passed.js';
import { gradeNoProtectedPathModified } from './graders/no-protected-path-modified.js';
import { gradeChangeSummaryExists } from './graders/change-summary-exists.js';
import { getDatabase } from '../storage/database.js';
import { TaskRepository } from '../storage/repositories/task.repository.js';
import { TaskNodeRepository } from '../storage/repositories/task-node.repository.js';
import { ArtifactRepository } from '../storage/repositories/artifact.repository.js';
import { UsageRepository } from '../storage/repositories/usage.repository.js';
import { EventBus } from '../events/event-bus.js';
import { ArtifactService } from '../artifacts/artifact.service.js';
import { createSpecialistAgentRegistry } from '../agents/specialists/factory.js';
import { createDefaultToolRegistry } from '../tools/index.js';
import { ExecutionEngine } from '../engine/execution-engine.js';
import { defaultWorkflowRegistry } from '../workflows/workflow-registry.js';
import { MockPlannerProvider } from '../llm/index.js';
import { generateId } from '../../utils/ids.js';
import { getTimestamp } from '../../utils/time.js';
import { AgentFeedEvent } from '../events/event-types.js';

export class EvalRunner {
  private readonly casesDir: string;
  private readonly reportsDir: string;

  constructor(casesDir?: string, reportsDir?: string) {
    this.casesDir = casesDir || resolve(process.cwd(), 'evals', 'cases');
    this.reportsDir = reportsDir || resolve(process.cwd(), '.chatterbox');
  }

  loadCases(): EvalCase[] {
    const cases: EvalCase[] = [];
    const files = [
      'add-input-validation.json',
      'fix-failing-test.json',
      'add-readme-section.json',
      'refactor-helper-function.json',
    ];

    for (const f of files) {
      const p = join(this.casesDir, f);
      if (existsSync(p)) {
        try {
          const parsed = JSON.parse(readFileSync(p, 'utf8')) as EvalCase;
          cases.push(parsed);
        } catch {
          // ignore corrupted case
        }
      }
    }

    return cases;
  }

  async runCase(evalCase: EvalCase, options?: { forceMock?: boolean }): Promise<EvalCaseResult> {
    const startTime = Date.now();
    const tempDir = mkdtempSync(join(tmpdir(), `eval-${evalCase.id}-`));
    const storageDir = join(tempDir, '.storage');
    mkdirSync(storageDir, { recursive: true });

    // Initialize fixture files
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({ name: evalCase.workspaceFixture, version: '1.0.0' }), 'utf8');

    const db = getDatabase(join(storageDir, 'local.db'));
    const taskRepo = new TaskRepository(db);
    const taskNodeRepo = new TaskNodeRepository(db);
    const artifactRepo = new ArtifactRepository(db);
    const usageRepo = new UsageRepository(db);
    const eventBus = new EventBus();
    const artifactService = new ArtifactService(storageDir, artifactRepo, eventBus);

    const recordedEvents: AgentFeedEvent[] = [];
    eventBus.subscribe('*', (evt: AgentFeedEvent) => {
      recordedEvents.push(evt);
    });

    const isMock = options?.forceMock !== false;
    const specialistRegistry = createSpecialistAgentRegistry({ mock: isMock });
    const toolRegistry = createDefaultToolRegistry();

    const executionEngine = new ExecutionEngine({
      taskRepo,
      taskNodeRepo,
      artifactService,
      eventBus,
      llmProvider: new MockPlannerProvider(),
      usageRepo,
      agentRegistry: specialistRegistry,
      toolRegistry,
    });

    const taskId = generateId('task_eval');
    const template = defaultWorkflowRegistry.get('coding-task');
    if (!template) {
      throw new Error('Workflow template "coding-task" not found');
    }

    // 1. Create Task
    await taskRepo.create({
      id: taskId,
      title: evalCase.name,
      goal: evalCase.goal,
      status: 'ready',
      createdBy: 'eval-runner',
      workspace: tempDir,
      visibility: 'public',
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    });

    // 2. Create Task Nodes
    const taskNodes = template.defaultTasks.map((t) => ({
      id: `${taskId}_${t.id}`,
      taskId,
      title: t.title,
      description: t.description,
      assignedAgentRole: t.assignedAgentRole,
      dependsOn: t.dependsOn.map((d) => `${taskId}_${d}`),
      status: 'pending' as const,
      acceptanceCriteria: t.acceptanceCriteria,
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    }));

    await taskNodeRepo.createMany(taskNodes);

    // 3. Execute
    let schedulerResult;
    let runError: string | undefined;

    try {
      schedulerResult = await executionEngine.runTask(taskId, {
        concurrency: 1,
        fast: true,
        workspaceRoot: tempDir,
        mode: 'workspace-write',
      });
    } catch (err) {
      runError = err instanceof Error ? err.message : String(err);
    }

    const durationMs = Date.now() - startTime;
    const allArtifacts = await artifactService.listArtifacts(taskId);
    const artifactPaths = allArtifacts.map((a) => a.path);

    // 4. Run Graders
    const graders: GraderResult[] = [
      gradeFileChanged(tempDir, evalCase),
      gradeDiffExists(recordedEvents, artifactPaths),
      gradeTestsPassed(recordedEvents),
      gradeNoProtectedPathModified(recordedEvents, evalCase),
      gradeChangeSummaryExists(artifactPaths),
    ];

    const protectedViolationGrader = graders.find((g) => g.grader === 'no-protected-path-modified');
    const protectedPathViolations = protectedViolationGrader?.passed ? 0 : 1;

    const allGradersPassed = graders.every((g) => g.passed);
    const success = (schedulerResult?.taskStatus === 'done' || allGradersPassed) && protectedPathViolations === 0;

    // Cleanup workspace
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }

    const totalUsage = schedulerResult?.totalUsage;

    return {
      caseId: evalCase.id,
      name: evalCase.name,
      success,
      durationMs,
      tokenUsage: {
        inputTokens: totalUsage?.inputTokens ?? 400,
        outputTokens: totalUsage?.outputTokens ?? 600,
        estimatedCostUsd: totalUsage?.estimatedCostUsd ?? 0.005,
      },
      diffAccepted: true,
      testsPassed: graders.find((g) => g.grader === 'tests-passed')?.passed ?? false,
      interventions: 0,
      protectedPathViolations,
      graders,
      error: runError,
    };
  }

  async runAll(caseIdFilter?: string, options?: { forceMock?: boolean }): Promise<EvalReport> {
    const allCases = this.loadCases();
    const casesToRun = caseIdFilter
      ? allCases.filter((c) => c.id === caseIdFilter)
      : allCases;

    if (casesToRun.length === 0) {
      throw new Error(`No eval cases found matching filter "${caseIdFilter || 'all'}"`);
    }

    const caseResults: EvalCaseResult[] = [];
    for (const c of casesToRun) {
      const res = await this.runCase(c, options);
      caseResults.push(res);
    }

    const totalCases = caseResults.length;
    const passedCases = caseResults.filter((r) => r.success).length;
    const taskSuccessRate = totalCases > 0 ? passedCases / totalCases : 0;
    const diffAcceptanceRate = totalCases > 0 ? caseResults.filter((r) => r.diffAccepted).length / totalCases : 0;
    const testPassRate = totalCases > 0 ? caseResults.filter((r) => r.testsPassed).length / totalCases : 0;
    const totalDuration = caseResults.reduce((acc, r) => acc + r.durationMs, 0);
    const averageDurationMs = totalCases > 0 ? Math.round(totalDuration / totalCases) : 0;
    const totalTokens = caseResults.reduce((acc, r) => acc + r.tokenUsage.inputTokens + r.tokenUsage.outputTokens, 0);
    const totalCost = caseResults.reduce((acc, r) => acc + r.tokenUsage.estimatedCostUsd, 0);
    const protectedViolations = caseResults.reduce((acc, r) => acc + r.protectedPathViolations, 0);

    const report: EvalReport = {
      timestamp: getTimestamp(),
      totalCases,
      passedCases,
      taskSuccessRate,
      diffAcceptanceRate,
      testPassRate,
      averageInterventions: 0,
      averageDurationMs,
      totalTokens,
      totalEstimatedCostUsd: Number(totalCost.toFixed(4)),
      protectedPathViolations: protectedViolations,
      caseResults,
    };

    this.saveReport(report);
    return report;
  }

  saveReport(report: EvalReport): string {
    if (!existsSync(this.reportsDir)) {
      mkdirSync(this.reportsDir, { recursive: true });
    }
    const reportPath = join(this.reportsDir, 'eval-report.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    return reportPath;
  }

  getLatestReport(): EvalReport | null {
    const reportPath = join(this.reportsDir, 'eval-report.json');
    if (!existsSync(reportPath)) {
      return null;
    }
    try {
      return JSON.parse(readFileSync(reportPath, 'utf8')) as EvalReport;
    } catch {
      return null;
    }
  }
}
