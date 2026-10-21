import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { repositoryContextService } from '../../src/core/workspace/repository-context.service.js';
import {
  RepositoryBriefSchema,
  ProposedFileOperationSchema,
  CodeChangePlanSchema,
  TestPlanSchema,
  CodeReviewResultSchema,
  ProposedChangesetSchema,
} from '../../src/core/agents/schemas/coding-schemas.js';
import { MockExplorerAgent } from '../../src/core/agents/specialists/mock-explorer.agent.js';
import { LlmExplorerAgent } from '../../src/core/agents/specialists/llm-explorer.agent.js';
import { ROLE_PERMISSIONS } from '../../src/core/security/permissions/types.js';
import { DefaultPermissionService } from '../../src/core/security/permissions/permission.service.js';
import { EventBus } from '../../src/core/events/event-bus.js';
import { EventStore } from '../../src/core/events/event-store.js';
import { ArtifactService } from '../../src/core/artifacts/artifact.service.js';
import { ArtifactRepository } from '../../src/core/storage/repositories/artifact.repository.js';
import { TaskRepository } from '../../src/core/storage/repositories/task.repository.js';
import { TaskNodeRepository } from '../../src/core/storage/repositories/task-node.repository.js';
import { createDatabaseConnection } from '../../src/core/storage/database.js';
import { createDefaultToolRegistry } from '../../src/core/tools/index.js';
import { getTimestamp } from '../../src/utils/time.js';

describe('Milestone 10 Phase 1: Explorer, Repository Context & Coding Schemas', () => {
  let testDir: string;
  let workspaceDir: string;
  let storageDir: string;
  let eventBus: EventBus;
  let eventStore: EventStore;
  let artifactRepo: ArtifactRepository;
  let taskRepo: TaskRepository;
  let taskNodeRepo: TaskNodeRepository;
  let artifactService: ArtifactService;
  let permissionService: DefaultPermissionService;

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), 'agentfeed-m10-phase1-'));
    workspaceDir = join(testDir, 'workspace');
    storageDir = join(testDir, 'storage');
    mkdirSync(workspaceDir, { recursive: true });
    mkdirSync(storageDir, { recursive: true });

    const db = createDatabaseConnection(join(storageDir, 'test.db'));
    artifactRepo = new ArtifactRepository(db);
    taskRepo = new TaskRepository(db);
    taskNodeRepo = new TaskNodeRepository(db);

    eventStore = new EventStore(storageDir);
    eventBus = new EventBus(eventStore);
    artifactService = new ArtifactService(storageDir, artifactRepo, eventBus);
    permissionService = new DefaultPermissionService({ eventBus });

    await taskRepo.create({
      id: 'task_phase1_test',
      title: 'Phase 1 Explorer Verification Task',
      goal: 'Add input validation to API and verify repository context',
      status: 'running',
      createdBy: 'operator',
      workspace: workspaceDir,
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    });

    await taskNodeRepo.createMany([
      {
        id: 'node_explore_1',
        taskId: 'task_phase1_test',
        title: 'Explore workspace context',
        description: 'Map architecture and detect conventions',
        assignedAgentRole: 'explorer',
        dependsOn: [],
        status: 'running',
        acceptanceCriteria: ['Output repository-brief.md'],
        createdAt: getTimestamp(),
        updatedAt: getTimestamp(),
      },
    ]);
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  // 1. Repository context detection
  it('1. detects package manager, scripts, and conventions from project files', async () => {
    // Seed package.json, pnpm-lock.yaml, tsconfig.json, and source files
    writeFileSync(
      join(workspaceDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test-api',
          type: 'module',
          scripts: {
            test: 'vitest run',
            lint: 'eslint src/',
            typecheck: 'tsc --noEmit',
            build: 'tsc',
          },
          dependencies: {
            express: '^4.19.0',
            zod: '^3.23.0',
          },
          devDependencies: {
            typescript: '^5.4.0',
            vitest: '^1.6.0',
            eslint: '^9.0.0',
          },
        },
        null,
        2
      ),
      'utf8'
    );
    writeFileSync(join(workspaceDir, 'pnpm-lock.yaml'), 'lockfileVersion: 5.4\n', 'utf8');
    writeFileSync(join(workspaceDir, 'tsconfig.json'), '{\n  "compilerOptions": { "strict": true }\n}\n', 'utf8');

    mkdirSync(join(workspaceDir, 'src', 'api'), { recursive: true });
    writeFileSync(join(workspaceDir, 'src', 'api', 'users.ts'), 'export const users = [];\n', 'utf8');
    writeFileSync(join(workspaceDir, 'src', 'api', 'auth.ts'), 'export const auth = {};\n', 'utf8');

    const ctx = await repositoryContextService.buildContext(workspaceDir, {
      goal: 'Add input validation to user API',
    });

    expect(ctx.packageManager).toBe('pnpm');
    expect(ctx.languages).toContain('TypeScript');
    expect(ctx.testCommand).toBe('pnpm test');
    expect(ctx.lintCommand).toBe('pnpm lint');
    expect(ctx.typecheckCommand).toBe('pnpm typecheck');
    expect(ctx.buildCommand).toBe('pnpm build');
    expect(ctx.conventions.some((c) => c.includes('Vitest'))).toBe(true);
    expect(ctx.conventions.some((c) => c.includes('Zod'))).toBe(true);
    expect(ctx.conventions.some((c) => c.includes('ESM'))).toBe(true);
    expect(ctx.projectStructure).toContain('src/');
    expect(ctx.projectStructure).toContain('users.ts');
  });

  // 2. Protected paths are never scanned or leaked
  it('2. guarantees protected paths (.env, .git, keys) are completely omitted from repository context', async () => {
    writeFileSync(join(workspaceDir, '.env'), 'SUPER_SECRET_TOKEN=xyz123\n', 'utf8');
    writeFileSync(join(workspaceDir, '.env.production'), 'API_KEY=secret_987\n', 'utf8');
    mkdirSync(join(workspaceDir, '.git'), { recursive: true });
    writeFileSync(join(workspaceDir, '.git', 'config'), '[core] bare = false\n', 'utf8');
    writeFileSync(join(workspaceDir, 'id_rsa'), 'PRIVATE_KEY\n', 'utf8');

    mkdirSync(join(workspaceDir, 'src'), { recursive: true });
    writeFileSync(join(workspaceDir, 'src', 'app.ts'), 'export const app = 1;\n', 'utf8');

    const ctx = await repositoryContextService.buildContext(workspaceDir, {
      goal: 'Inspect environment and configuration',
    });

    expect(ctx.projectStructure).not.toContain('.env');
    expect(ctx.projectStructure).not.toContain('SUPER_SECRET_TOKEN');
    expect(ctx.projectStructure).not.toContain('.git');
    expect(ctx.projectStructure).not.toContain('id_rsa');
    expect(ctx.relevantFiles.some((f) => f.includes('.env'))).toBe(false);
  });

  // 3. Relevant file identification
  it('3. scores and identifies relevant files based on goal keywords', async () => {
    mkdirSync(join(workspaceDir, 'src', 'validation'), { recursive: true });
    mkdirSync(join(workspaceDir, 'src', 'models'), { recursive: true });
    mkdirSync(join(workspaceDir, 'src', 'controllers'), { recursive: true });

    writeFileSync(join(workspaceDir, 'src', 'validation', 'user.schema.ts'), 'export const schema = {};\n', 'utf8');
    writeFileSync(join(workspaceDir, 'src', 'controllers', 'user.controller.ts'), 'export class UserController {}\n', 'utf8');
    writeFileSync(join(workspaceDir, 'src', 'models', 'product.model.ts'), 'export class Product {}\n', 'utf8');

    const ctx = await repositoryContextService.buildContext(workspaceDir, {
      goal: 'Add input validation schema to user controller',
    });

    expect(ctx.relevantFiles.length).toBeGreaterThan(0);
    // User validation and user controller should be ranked top
    expect(ctx.relevantFiles.some((f) => f.includes('user.schema.ts') || f.includes('user.controller.ts'))).toBe(true);
  });

  // 4. Explorer agent execution and artifact generation
  it('4. MockExplorerAgent executes safely, returns valid brief, and creates repository-brief artifact', async () => {
    writeFileSync(
      join(workspaceDir, 'package.json'),
      JSON.stringify({ name: 'sample-service', scripts: { test: 'vitest run' } }),
      'utf8'
    );
    mkdirSync(join(workspaceDir, 'src'), { recursive: true });
    writeFileSync(join(workspaceDir, 'src', 'index.ts'), 'export const active = true;\n', 'utf8');

    const registry = createDefaultToolRegistry();
    const explorer = new MockExplorerAgent();

    const result = await explorer.run({
      taskId: 'task_phase1_test',
      nodeId: 'node_explore_1',
      goal: 'Add input validation to API',
      taskTitle: 'Explore workspace context',
      node: {
        id: 'node_explore_1',
        taskId: 'task_phase1_test',
        title: 'Explore workspace context',
        description: 'Map architecture and detect conventions',
        assignedAgentRole: 'explorer',
        dependsOn: [],
        status: 'running',
        acceptanceCriteria: ['Output repository-brief.md'],
        createdAt: getTimestamp(),
        updatedAt: getTimestamp(),
      },
      inputArtifacts: [],
      dependencies: [],
      signal: new AbortController().signal,
      llmProvider: null as any,
      toolRegistry: registry,
      eventBus,
      artifactService,
      fast: true,
      workspaceRoot: workspaceDir,
    });

    expect(result.status).toBe('done');
    expect(result.outputArtifactIds.length).toBeGreaterThan(0);

    const artifacts = await artifactService.listArtifacts('task_phase1_test');
    const briefArtifact = artifacts.find((a) => a.title.includes('Repository Brief'));
    expect(briefArtifact).toBeDefined();
    expect(existsSync(briefArtifact!.path)).toBe(true);

    const content = readFileSync(briefArtifact!.path, 'utf8');
    expect(content).toContain('Repository Brief');
    expect(content).toContain('Languages & Stack');
    expect(content).toContain('Package Manager & Commands');
    expect(content).toContain('Project Tree');
  });

  // 5. Explorer agent in LLM fallback mode
  it('5. LlmExplorerAgent produces grounded RepositoryBrief artifact when LLM provider is not present', async () => {
    writeFileSync(
      join(workspaceDir, 'package.json'),
      JSON.stringify({ name: 'llm-test-app', scripts: { test: 'npm test' } }),
      'utf8'
    );
    mkdirSync(join(workspaceDir, 'lib'), { recursive: true });
    writeFileSync(join(workspaceDir, 'lib', 'core.js'), 'module.exports = {};\n', 'utf8');

    const registry = createDefaultToolRegistry();
    const explorer = new LlmExplorerAgent();

    const result = await explorer.run({
      taskId: 'task_phase1_test',
      nodeId: 'node_explore_1',
      goal: 'Refactor core modules and add tests',
      taskTitle: 'Explore workspace context',
      node: {
        id: 'node_explore_1',
        taskId: 'task_phase1_test',
        title: 'Explore workspace context',
        description: 'Map architecture and detect conventions',
        assignedAgentRole: 'explorer',
        dependsOn: [],
        status: 'running',
        acceptanceCriteria: ['Output repository-brief.md'],
        createdAt: getTimestamp(),
        updatedAt: getTimestamp(),
      },
      inputArtifacts: [],
      dependencies: [],
      signal: new AbortController().signal,
      llmProvider: null as any,
      toolRegistry: registry,
      eventBus,
      artifactService,
      workspaceRoot: workspaceDir,
    });

    expect(result.status).toBe('done');
    const artifacts = await artifactService.listArtifacts('task_phase1_test');
    expect(artifacts.some((a) => a.title.includes('Repository Brief'))).toBe(true);
  });

  // 6. Coding Zod schemas validation
  it('6. validates and enforces schemas for RepositoryBrief, ProposedFileOperation, CodeChangePlan, TestPlan, and CodeReviewResult', () => {
    // A. RepositoryBrief
    const validBrief = {
      summary: 'Express API with TypeScript and Vitest',
      languages: ['TypeScript', 'JavaScript'],
      relevantFiles: ['src/index.ts', 'src/routes.ts'],
      existingPatterns: ['Zod validation', 'Vitest'],
      risks: ['Strict mode required'],
      openQuestions: [],
    };
    expect(RepositoryBriefSchema.parse(validBrief)).toEqual(validBrief);
    expect(() => RepositoryBriefSchema.parse({ summary: '' })).toThrow();

    // B. ProposedFileOperation
    const validCreateOp = {
      operation: 'create_file',
      path: 'src/schemas/user.ts',
      content: 'export const user = 1;',
      reason: 'User validation schema',
    };
    expect(ProposedFileOperationSchema.parse(validCreateOp)).toEqual(validCreateOp);

    const validEditOp = {
      operation: 'edit_file',
      path: 'src/app.ts',
      search: 'old',
      replace: 'new',
      reason: 'Update handler',
    };
    expect(ProposedFileOperationSchema.parse(validEditOp)).toEqual(validEditOp);

    const validFolderOp = {
      operation: 'create_folder',
      path: 'src/schemas',
      reason: 'Schema folder',
    };
    expect(ProposedFileOperationSchema.parse(validFolderOp)).toEqual(validFolderOp);

    // C. CodeChangePlan
    const validPlan = {
      summary: 'Add user validation and tests',
      operations: [validCreateOp, validEditOp],
      testStrategy: 'Unit tests via Vitest',
      risks: ['None'],
    };
    expect(CodeChangePlanSchema.parse(validPlan)).toEqual(validPlan);
    expect(() => CodeChangePlanSchema.parse({ summary: 'Plan', operations: [] })).toThrow();

    // D. TestPlan
    const validTestPlan = {
      strategy: 'Add regression tests for input boundaries',
      filesToCreate: ['tests/unit/validation.test.ts'],
      filesToUpdate: [],
      commands: ['pnpm test'],
    };
    expect(TestPlanSchema.parse(validTestPlan)).toEqual(validTestPlan);
    expect(() => TestPlanSchema.parse({ strategy: 'No commands', commands: [] })).toThrow();

    // E. CodeReviewResult
    const validReview = {
      verdict: 'approve',
      score: 95,
      issues: [],
      requiredChanges: [],
      testCoverageAssessment: 'Covers all boundary cases',
    };
    expect(CodeReviewResultSchema.parse(validReview)).toEqual(validReview);
    expect(() => CodeReviewResultSchema.parse({ verdict: 'invalid' })).toThrow();

    // F. ProposedChangeset
    const now = getTimestamp();
    const validChangeset = {
      id: 'cs_123',
      taskId: 'task_phase1_test',
      nodeId: 'node_1',
      agentRole: 'coder' as const,
      operations: [validCreateOp],
      diffs: [
        {
          filePath: 'src/schemas/user.ts',
          changeType: 'create' as const,
          unifiedDiff: '--- /dev/null\n+++ b/src/schemas/user.ts\n@@ -0,0 +1,1 @@\n+export const user = 1;',
          additions: 1,
          deletions: 0,
        },
      ],
      fileHashes: {},
      status: 'proposed' as const,
      summary: 'Initial user schema creation',
      additions: 1,
      deletions: 0,
      createdAt: now,
      updatedAt: now,
    };
    expect(ProposedChangesetSchema.parse(validChangeset)).toEqual(validChangeset);
  });


  // 7. Explorer role permissions are strictly read-only
  it('7. verifies explorer role is strictly read-only and denies write and shell execution', async () => {
    const explorerPerms = ROLE_PERMISSIONS['explorer'];
    expect(explorerPerms.allowed).toContain('file:read');
    expect(explorerPerms.allowed).toContain('artifact:create');
    expect(explorerPerms.allowed).toContain('artifact:read');
    expect(explorerPerms.denied).toContain('file:write');
    expect(explorerPerms.denied).toContain('shell:execute');
    expect(explorerPerms.denied).toContain('secret:read');

    const fileWriteDecision = await permissionService.check({
      agentRole: 'explorer',
      permission: 'file:write',
      resource: 'src/test.ts',
    });
    expect(fileWriteDecision.allowed).toBe(false);

    const shellDecision = await permissionService.check({
      agentRole: 'explorer',
      permission: 'shell:execute',
      resource: 'pnpm test',
    });
    expect(shellDecision.allowed).toBe(false);

    const fileReadDecision = await permissionService.check({
      agentRole: 'explorer',
      permission: 'file:read',
      resource: 'package.json',
    });
    expect(fileReadDecision.allowed).toBe(true);
  });
});
