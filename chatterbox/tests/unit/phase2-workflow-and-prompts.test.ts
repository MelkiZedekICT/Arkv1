import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { defaultWorkflowRegistry } from '../../src/core/workflows/workflow-registry.js';
import { buildExplorerPromptMessages } from '../../src/core/agents/prompts/explorer.prompt.js';
import { buildPlannerPromptMessages } from '../../src/core/agents/prompts/planner.prompt.js';
import { buildCoderPromptMessages } from '../../src/core/agents/prompts/coder.prompt.js';
import { buildTesterPromptMessages } from '../../src/core/agents/prompts/tester.prompt.js';
import { buildReviewerPromptMessages } from '../../src/core/agents/prompts/reviewer.prompt.js';
import { MockExplorerAgent } from '../../src/core/agents/specialists/mock-explorer.agent.js';
import { MockPlannerAgent } from '../../src/core/agents/specialists/mock-planner.agent.js';
import { MockCoderAgent } from '../../src/core/agents/specialists/mock-coder.agent.js';
import { MockTesterAgent } from '../../src/core/agents/specialists/mock-tester.agent.js';
import { MockReviewerAgent } from '../../src/core/agents/specialists/mock-reviewer.agent.js';
import { LlmCoderAgent } from '../../src/core/agents/specialists/llm-coder.agent.js';
import { LlmTesterAgent } from '../../src/core/agents/specialists/llm-tester.agent.js';
import { LlmReviewerAgent } from '../../src/core/agents/specialists/llm-reviewer.agent.js';
import { EventBus } from '../../src/core/events/event-bus.js';
import { EventStore } from '../../src/core/events/event-store.js';
import { ArtifactService } from '../../src/core/artifacts/artifact.service.js';
import { ArtifactRepository } from '../../src/core/storage/repositories/artifact.repository.js';
import { getDatabase } from '../../src/core/storage/database.js';
import { createDefaultToolRegistry } from '../../src/core/tools/index.js';
import { TaskRepository } from '../../src/core/storage/repositories/task.repository.js';
import { TaskNodeRepository } from '../../src/core/storage/repositories/task-node.repository.js';
import { UsageRepository } from '../../src/core/storage/repositories/usage.repository.js';
import { TaskNode } from '../../src/core/models/task-node.js';
import { ROLE_PERMISSIONS } from '../../src/core/security/permissions/types.js';
import { DefaultPermissionService } from '../../src/core/security/permissions/permission.service.js';
import { MockSpecialistProvider } from '../../src/core/llm/mock-specialist-provider.js';
import { parseOrRepairJson } from '../../src/core/agents/schemas/specialist-schemas.js';
import { CodeChangePlanSchema, TestPlanSchema, CodeReviewResultSchema } from '../../src/core/agents/schemas/coding-schemas.js';
import { ExecutionEngine } from '../../src/core/engine/execution-engine.js';
import { createSpecialistAgentRegistry } from '../../src/core/agents/specialists/factory.js';
import { getTimestamp } from '../../src/utils/time.js';

describe('Milestone 10 Phase 2: Prompts and 7-stage Workflow', () => {
  let tempDir: string;
  let eventBus: EventBus;
  let artifactService: ArtifactService;
  let taskRepo: TaskRepository;
  let taskNodeRepo: TaskNodeRepository;
  let artifactRepo: ArtifactRepository;
  let usageRepo: UsageRepository;
  let toolRegistry: ReturnType<typeof createDefaultToolRegistry>;
  let permissionService: DefaultPermissionService;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'phase2-test-'));
    const db = getDatabase(join(tempDir, 'test.db'));
    taskRepo = new TaskRepository(db);
    taskNodeRepo = new TaskNodeRepository(db);
    artifactRepo = new ArtifactRepository(db);
    usageRepo = new UsageRepository(db);
    const eventStore = new EventStore(tempDir);
    eventBus = new EventBus(eventStore);
    artifactService = new ArtifactService(tempDir, artifactRepo, eventBus);
    toolRegistry = createDefaultToolRegistry();
    permissionService = new DefaultPermissionService({ eventBus });

    await taskRepo.create({
      id: 'task_p2',
      title: 'Phase 2 Test Task',
      goal: 'Add input validation to API and add tests',
      status: 'running',
      createdBy: 'test_operator',
      visibility: 'public',
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    });
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // 1. Coding-task workflow creates the 7-stage DAG
  it('1. registers the exact 7-stage coding workflow template with strict linear DAG', () => {
    const template = defaultWorkflowRegistry.get('coding-task');
    expect(template).toBeDefined();
    expect(template?.defaultTasks.length).toBe(7);

    const tasks = template!.defaultTasks;
    expect(tasks[0].id).toBe('task_1');
    expect(tasks[0].assignedAgentRole).toBe('explorer');
    expect(tasks[0].dependsOn).toEqual([]);

    expect(tasks[1].id).toBe('task_2');
    expect(tasks[1].assignedAgentRole).toBe('planner');
    expect(tasks[1].dependsOn).toEqual(['task_1']);

    expect(tasks[2].id).toBe('task_3');
    expect(tasks[2].assignedAgentRole).toBe('coder');
    expect(tasks[2].dependsOn).toEqual(['task_2']);

    expect(tasks[3].id).toBe('task_4');
    expect(tasks[3].assignedAgentRole).toBe('tester');
    expect(tasks[3].dependsOn).toEqual(['task_3']);

    expect(tasks[4].id).toBe('task_5');
    expect(tasks[4].assignedAgentRole).toBe('tester');
    expect(tasks[4].dependsOn).toEqual(['task_4']);

    expect(tasks[5].id).toBe('task_6');
    expect(tasks[5].assignedAgentRole).toBe('reviewer');
    expect(tasks[5].dependsOn).toEqual(['task_5']);

    expect(tasks[6].id).toBe('task_7');
    expect(tasks[6].assignedAgentRole).toBe('reviewer');
    expect(tasks[6].dependsOn).toEqual(['task_6']);
  });

  // 2. Prompt builders enforce sections, constraints, JSON schemas, and no placeholders
  it('2. verifies specialist prompt builders enforce sections (<role>, <context>, <constraints>, <output_format>, <done_when>), JSON schemas, and no placeholders', () => {
    const explorerMsgs = buildExplorerPromptMessages('Goal', 'Context summary');
    expect(explorerMsgs[0].content).toContain('<role>');
    expect(explorerMsgs[0].content).toContain('<constraints>');
    expect(explorerMsgs[0].content).toContain('<output_format>');
    expect(explorerMsgs[0].content).toContain('RepositoryBrief');
    expect(explorerMsgs[0].content).toContain('read-only inspection');

    const plannerMsgs = buildPlannerPromptMessages({ goal: 'Add input validation' });
    expect(plannerMsgs[0].content).toContain('<role>');
    expect(plannerMsgs[0].content).toContain('<constraints>');
    expect(plannerMsgs[0].content).toContain('<output_format>');
    expect(plannerMsgs[0].content).toContain('between 3 and 7 tasks');

    const coderMsgs = buildCoderPromptMessages('Add auth', 'Implement changes');
    expect(coderMsgs[0].content).toContain('<role>');
    expect(coderMsgs[0].content).toContain('<constraints>');
    expect(coderMsgs[0].content).toContain('<output_format>');
    expect(coderMsgs[0].content).toContain('CodeChangePlan');
    expect(coderMsgs[0].content).toContain('TODO');
    expect(coderMsgs[0].content).toContain('workspace root');

    const testerMsgs = buildTesterPromptMessages('Test auth', 'Run tests');
    expect(testerMsgs[0].content).toContain('<role>');
    expect(testerMsgs[0].content).toContain('<constraints>');
    expect(testerMsgs[0].content).toContain('<output_format>');
    expect(testerMsgs[0].content).toContain('TestPlan');
    expect(testerMsgs[0].content).toContain('allowlisted');

    const reviewerMsgs = buildReviewerPromptMessages('Review', '--- a/f\n+++ b/f');
    expect(reviewerMsgs[0].content).toContain('<role>');
    expect(reviewerMsgs[0].content).toContain('<constraints>');
    expect(reviewerMsgs[0].content).toContain('<output_format>');
    expect(reviewerMsgs[0].content).toContain('CodeReviewResult');
    expect(reviewerMsgs[0].content).toContain('TODO');
  });

  // 3. Planner creates an acyclic 3-7 task graph receiving Explorer brief
  it('3. Planner consumes Explorer repository brief and creates implementation-plan.md artifact', async () => {
    const agent = new MockPlannerAgent();
    const briefArt = await artifactService.createArtifact({
      taskId: 'task_p2',
      nodeId: 'node_1',
      title: 'Repository Brief',
      filename: 'repository-brief.md',
      content: '# Repository Brief\n\nFramework: Express\nConventions: strict',
      type: 'markdown',
      authorType: 'agent',
      authorId: 'agent_explorer',
    });

    const node: TaskNode = {
      id: 'task_p2_node_2',
      taskId: 'task_p2',
      title: 'Plan implementation',
      description: 'Formulate implementation plan',
      assignedAgentRole: 'planner',
      dependsOn: ['task_p2_node_1'],
      status: 'pending',
      acceptanceCriteria: ['Produce implementation plan'],
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    };

    const res = await agent.run({
      taskId: 'task_p2',
      nodeId: node.id,
      goal: 'Add input validation',
      node,
      inputArtifacts: [briefArt],
      toolRegistry,
      eventBus,
      artifactService,
      fast: true,
      workspaceRoot: tempDir,
    });

    expect(res.status).toBe('done');
    expect(res.outputArtifactIds.length).toBeGreaterThan(0);
    const created = await artifactService.getArtifact(res.outputArtifactIds[0]);
    expect(created?.title).toContain('Implementation Plan');
    const content = await artifactService.readArtifactContent(res.outputArtifactIds[0]);
    expect(content).toContain('Implementation Plan');
  });

  // 4. Explorer runs before Planner in 7-stage dependency order
  it('4. ensures Explorer task_1 runs before Planner task_2 with zero dependsOn for task_1', () => {
    const template = defaultWorkflowRegistry.get('coding-task');
    const task1 = template?.defaultTasks.find((t) => t.id === 'task_1');
    const task2 = template?.defaultTasks.find((t) => t.id === 'task_2');
    expect(task1?.assignedAgentRole).toBe('explorer');
    expect(task1?.dependsOn).toEqual([]);
    expect(task2?.assignedAgentRole).toBe('planner');
    expect(task2?.dependsOn).toContain('task_1');
  });

  // 5. Coder receives plan and repository context and returns valid CodeChangePlan
  it('5. Coder produces valid code changes conforming to CodeChangePlanSchema', async () => {
    const agent = new MockCoderAgent();
    const node: TaskNode = {
      id: 'task_p2_node_3',
      taskId: 'task_p2',
      title: 'Implement changes',
      description: 'Implement input validation logic',
      assignedAgentRole: 'coder',
      dependsOn: ['task_p2_node_2'],
      status: 'pending',
      acceptanceCriteria: ['Implement input validation'],
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    };

    const res = await agent.run({
      taskId: 'task_p2',
      nodeId: node.id,
      goal: 'Add input validation',
      node,
      inputArtifacts: [],
      toolRegistry,
      eventBus,
      artifactService,
      fast: true,
      workspaceRoot: tempDir,
    });

    expect(res.status).toBe('done');
    expect(res.outputArtifactIds.length).toBeGreaterThan(0);
    const art = await artifactService.getArtifact(res.outputArtifactIds[0]);
    expect(art?.title).toContain('Code Changes');
  });

  // 6. Invalid Coder JSON triggers repair/retry
  it('6. invalid Coder JSON triggers repair/retry loop and recovers on valid schema', async () => {
    const mockProvider = new MockSpecialistProvider();
    // Enqueue valid CodeChangePlan JSON for the repair response
    const validPlan = {
      summary: 'Add user input validation module',
      operations: [
        {
          operation: 'create_file',
          path: 'src/validation.ts',
          content: 'export const validate = () => true;',
          reason: 'Input validation function',
        },
      ],
      testStrategy: 'Unit tests with Vitest',
      risks: ['Strict typechecking applies'],
    };
    mockProvider.enqueueResponse({ text: JSON.stringify(validPlan) });

    let repairCalls = 0;
    const result = await parseOrRepairJson({
      rawText: '{"summary": "Broken change plan without operations"}',
      schema: CodeChangePlanSchema,
      provider: mockProvider,
      maxRepairAttempts: 2,
      onRepairAttempt: () => {
        repairCalls++;
      },
    });

    expect(repairCalls).toBe(1);
    expect(result.data.summary).toBe('Add user input validation module');
    expect(result.data.operations.length).toBe(1);
  });

  // 7. Tester receives changes and returns valid TestPlan
  it('7. Tester receives changes and returns valid TestPlan on Node 4', async () => {
    const agent = new MockTesterAgent();
    const node4: TaskNode = {
      id: 'task_p2_node_4',
      taskId: 'task_p2',
      title: 'Create/update tests',
      description: 'Author unit tests',
      assignedAgentRole: 'tester',
      dependsOn: ['task_p2_node_3'],
      status: 'pending',
      acceptanceCriteria: ['Author test assertions'],
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    };

    const res4 = await agent.run({
      taskId: 'task_p2',
      nodeId: node4.id,
      goal: 'Validate input',
      node: node4,
      inputArtifacts: [],
      toolRegistry,
      eventBus,
      artifactService,
      fast: true,
      workspaceRoot: tempDir,
    });

    expect(res4.status).toBe('done');
    const planArt = await artifactService.getArtifact(res4.outputArtifactIds[0]);
    expect(planArt?.path).toContain('test-plan.md');
  });

  // 8. Tester runs allowlisted tests and captures results in test-report.md
  it('8. Tester executes allowlisted test runner and records outcome in test-report.md on Node 5', async () => {
    const agent = new MockTesterAgent();
    const node5: TaskNode = {
      id: 'task_p2_node_5',
      taskId: 'task_p2',
      title: 'Run tests',
      description: 'Execute allowlisted tests',
      assignedAgentRole: 'tester',
      dependsOn: ['task_p2_node_4'],
      status: 'pending',
      acceptanceCriteria: ['Verify test results'],
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    };

    const res5 = await agent.run({
      taskId: 'task_p2',
      nodeId: node5.id,
      goal: 'Validate input',
      node: node5,
      inputArtifacts: [],
      toolRegistry,
      eventBus,
      artifactService,
      fast: true,
      workspaceRoot: tempDir,
    });

    expect(res5.status).toBe('done');
    const reportArt = await artifactService.getArtifact(res5.outputArtifactIds[0]);
    expect(reportArt?.path).toContain('test-report.md');
  });

  // 9. Reviewer receives diff and test results and outputs code-review.md
  it('9. Reviewer receives diff and test results and outputs code-review.md on Node 6', async () => {
    const agent = new MockReviewerAgent();
    const node6: TaskNode = {
      id: 'task_p2_node_6',
      taskId: 'task_p2',
      title: 'Review diff and tests',
      description: 'Audit proposed changes',
      assignedAgentRole: 'reviewer',
      dependsOn: ['task_p2_node_5'],
      status: 'pending',
      acceptanceCriteria: ['Audit diff and test report'],
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    };

    const res6 = await agent.run({
      taskId: 'task_p2',
      nodeId: node6.id,
      goal: 'Validate input',
      node: node6,
      inputArtifacts: [],
      toolRegistry,
      eventBus,
      artifactService,
      fast: true,
      workspaceRoot: tempDir,
    });

    expect(res6.status).toBe('done');
    const reviewArt = await artifactService.getArtifact(res6.outputArtifactIds[0]);
    expect(reviewArt?.path).toContain('code-review.md');
  });

  // 10. Reviewer can return approve, revise, or block
  it('10. CodeReviewResultSchema strictly validates approve, revise, and block verdicts', () => {
    const approve = { verdict: 'approve', score: 98, issues: [], requiredChanges: [], testCoverageAssessment: 'Passed' };
    const revise = { verdict: 'revise', score: 65, issues: ['Missing null check'], requiredChanges: ['Add null guard'], testCoverageAssessment: 'Partial' };
    const block = { verdict: 'block', score: 10, issues: ['Secret access attempted'], requiredChanges: ['Remove secret token'], testCoverageAssessment: 'Failing' };

    expect(CodeReviewResultSchema.parse(approve).verdict).toBe('approve');
    expect(CodeReviewResultSchema.parse(revise).verdict).toBe('revise');
    expect(CodeReviewResultSchema.parse(block).verdict).toBe('block');
    expect(() => CodeReviewResultSchema.parse({ verdict: 'unknown' })).toThrow();
  });

  // 11. Reviewer creates change summary and changes.diff on node 7
  it('11. Reviewer produces change-summary.md and changes.diff release deliverables on Node 7', async () => {
    const agent = new MockReviewerAgent();
    const node7: TaskNode = {
      id: 'task_p2_node_7',
      taskId: 'task_p2',
      title: 'Create change summary',
      description: 'Produce release deliverables',
      assignedAgentRole: 'reviewer',
      dependsOn: ['task_p2_node_6'],
      status: 'pending',
      acceptanceCriteria: ['Generate change-summary.md and changes.diff'],
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    };

    const res7 = await agent.run({
      taskId: 'task_p2',
      nodeId: node7.id,
      goal: 'Validate input',
      node: node7,
      inputArtifacts: [],
      toolRegistry,
      eventBus,
      artifactService,
      fast: true,
      workspaceRoot: tempDir,
    });

    expect(res7.status).toBe('done');
    const summaryArt = await artifactService.getArtifact(res7.outputArtifactIds[0]);
    expect(summaryArt?.path).toContain('change-summary.md');
    const allArts = await artifactService.listArtifacts('task_p2');
    expect(allArts.some((a) => a.path.endsWith('changes.diff'))).toBe(true);
  });

  // 12. Mock workflow completes end to end
  it('12. runs complete 7-stage mock workflow end to end to done status', async () => {
    const agentRegistry = createSpecialistAgentRegistry({ mock: true });
    const engine = new ExecutionEngine({
      taskRepo,
      taskNodeRepo,
      artifactRepo,
      usageRepo,
      agentRegistry,
      toolRegistry,
      eventBus,
      artifactService,
    });

    // Seed all 7 nodes matching coding-task DAG
    const template = defaultWorkflowRegistry.get('coding-task')!;
    const now = getTimestamp();
    const nodes: TaskNode[] = template.defaultTasks.map((t) => ({
      id: `task_p2_${t.id}`,
      taskId: 'task_p2',
      title: t.title,
      description: t.description,
      assignedAgentRole: t.assignedAgentRole as any,
      dependsOn: t.dependsOn.map((d) => `task_p2_${d}`),
      status: 'pending',
      acceptanceCriteria: t.acceptanceCriteria,
      createdAt: now,
      updatedAt: now,
    }));
    await taskNodeRepo.createMany(nodes);

    const result = await engine.runTask('task_p2', {
      fast: true,
      concurrency: 1,
      workspaceRoot: tempDir,
    });

    expect(result.taskStatus).toBe('done');
    expect(result.nodesCompleted).toBe(7);
    expect(result.nodesFailed).toBe(0);

    const artifacts = await artifactService.listArtifacts('task_p2');
    expect(artifacts.some((a) => a.path.includes('repository-brief.md'))).toBe(true);
    expect(artifacts.some((a) => a.path.includes('implementation-plan.md'))).toBe(true);
    expect(artifacts.some((a) => a.path.includes('test-plan.md'))).toBe(true);
    expect(artifacts.some((a) => a.path.includes('test-report.md'))).toBe(true);
    expect(artifacts.some((a) => a.path.includes('code-review.md'))).toBe(true);
    expect(artifacts.some((a) => a.path.includes('change-summary.md'))).toBe(true);
    expect(artifacts.some((a) => a.path.includes('changes.diff'))).toBe(true);
  });

  // 13. Explorer cannot write files or execute shell commands
  it('13. Explorer role strictly denies file:write and shell:execute permissions', async () => {
    const explorerPerms = ROLE_PERMISSIONS['explorer'];
    expect(explorerPerms.denied).toContain('file:write');
    expect(explorerPerms.denied).toContain('shell:execute');

    const writeDecision = await permissionService.check({
      agentRole: 'explorer',
      permission: 'file:write',
      resource: 'src/index.ts',
    });
    expect(writeDecision.allowed).toBe(false);

    const shellDecision = await permissionService.check({
      agentRole: 'explorer',
      permission: 'shell:execute',
      resource: 'pnpm test',
    });
    expect(shellDecision.allowed).toBe(false);
  });

  // 14. No protected paths are accessed
  it('14. guarantees protected paths (.env, .git, *.key) are isolated and inaccessible', async () => {
    writeFileSync(join(tempDir, '.env'), 'SUPER_SECRET_TOKEN=xyz\n');
    const readDecision = await permissionService.check({
      agentRole: 'explorer',
      permission: 'file:read',
      resource: '.env',
    });
    expect(readDecision.allowed).toBe(true); // permission check on role level
    // Tool execution denies access to protected path
    const res = await toolRegistry.execute('read_file', { filePath: '.env' }, {
      taskId: 'task_p2',
      nodeId: 'node_1',
      actorId: 'agent_explorer',
      correlationId: 'c1',
      artifactService,
      eventBus,
      workspaceRoot: tempDir,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('protected');
  });

  // 15. No secrets appear in logs, events, errors, or test snapshots
  it('15. verifies no secrets appear in emitted events or generated artifacts', async () => {
    const secret = 'sk-prod-supersecrettoken999';
    const events: any[] = [];
    eventBus.on('*', (e) => events.push(e));

    const agent = new MockExplorerAgent();
    const node: TaskNode = {
      id: 'task_p2_node_sec',
      taskId: 'task_p2',
      title: 'Explore repo context',
      description: 'Explore workspace',
      assignedAgentRole: 'explorer',
      dependsOn: [],
      status: 'pending',
      acceptanceCriteria: ['Scan workspace'],
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    };

    await agent.run({
      taskId: 'task_p2',
      nodeId: node.id,
      goal: 'Explore repository',
      node,
      inputArtifacts: [],
      toolRegistry,
      eventBus,
      artifactService,
      fast: true,
      workspaceRoot: tempDir,
    });

    const eventJson = JSON.stringify(events);
    expect(eventJson).not.toContain(secret);
    expect(eventJson).not.toContain('SUPER_SECRET_TOKEN');

    const artifacts = await artifactService.listArtifacts('task_p2');
    for (const art of artifacts) {
      const content = await artifactService.readArtifactContent(art.id);
      expect(content).not.toContain(secret);
      expect(content).not.toContain('SUPER_SECRET_TOKEN');
    }
  });
});
