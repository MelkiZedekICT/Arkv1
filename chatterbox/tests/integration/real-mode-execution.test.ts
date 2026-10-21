import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ExecutionEngine } from '../../src/core/engine/execution-engine.js';
import { TaskRepository } from '../../src/core/storage/repositories/task.repository.js';
import { TaskNodeRepository } from '../../src/core/storage/repositories/task-node.repository.js';
import { ArtifactRepository } from '../../src/core/storage/repositories/artifact.repository.js';
import { UsageRepository } from '../../src/core/storage/repositories/usage.repository.js';
import { ArtifactService } from '../../src/core/artifacts/artifact.service.js';
import { EventStore } from '../../src/core/events/event-store.js';
import { EventBus } from '../../src/core/events/event-bus.js';
import { getDatabase } from '../../src/core/storage/database.js';
import { MockSpecialistProvider } from '../../src/core/llm/mock-specialist-provider.js';
import { createSpecialistAgentRegistry } from '../../src/core/agents/specialists/factory.js';
import { TaskNode } from '../../src/core/models/task-node.js';
import { getTimestamp } from '../../src/utils/time.js';

describe('Real Mode vs Mock Mode Execution Flow', () => {
  let tempDir: string;
  let taskRepo: TaskRepository;
  let taskNodeRepo: TaskNodeRepository;
  let usageRepo: UsageRepository;
  let artifactService: ArtifactService;
  let eventBus: EventBus;
  const taskId = 'task_real_mode_test_1';

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'agentfeed-real-mode-test-'));
    const dbPath = join(tempDir, 'test.db');
    const db = getDatabase(dbPath);

    taskRepo = new TaskRepository(db);
    taskNodeRepo = new TaskNodeRepository(db);
    const artifactRepo = new ArtifactRepository(db);
    usageRepo = new UsageRepository(db);
    const eventStore = new EventStore(tempDir);
    eventBus = new EventBus(eventStore);
    artifactService = new ArtifactService(tempDir, artifactRepo, eventBus);
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error on windows
    }
  });

  it('runs --mock mode to completion with zero network and zero API key (Test 16)', async () => {
    // 1. Create task
    await taskRepo.create({
      id: taskId,
      title: 'Mock Mode Task',
      goal: 'Create competitive brief on AI-agent security',
      status: 'ready',
      createdBy: 'operator',
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    });

    // 2. Create task nodes using mock specialists
    const now = getTimestamp();
    const taskNodes: TaskNode[] = [
      {
        id: `${taskId}_node_res`,
        taskId,
        title: 'Research',
        description: 'Research vendors',
        assignedAgentRole: 'researcher',
        dependsOn: [],
        status: 'pending',
        acceptanceCriteria: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: `${taskId}_node_writer`,
        taskId,
        title: 'Writer',
        description: 'Draft brief',
        assignedAgentRole: 'writer',
        dependsOn: [`${taskId}_node_res`],
        status: 'pending',
        acceptanceCriteria: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: `${taskId}_node_rev`,
        taskId,
        title: 'Reviewer',
        description: 'Review brief',
        assignedAgentRole: 'reviewer',
        dependsOn: [`${taskId}_node_writer`],
        status: 'pending',
        acceptanceCriteria: [],
        createdAt: now,
        updatedAt: now,
      },
    ];

    await taskNodeRepo.createMany(taskNodes);

    const mockRegistry = createSpecialistAgentRegistry({ mock: true });
    const mockLlm = new MockSpecialistProvider();

    const engine = new ExecutionEngine({
      taskRepo,
      taskNodeRepo,
      artifactService,
      eventBus,
      llmProvider: mockLlm,
      usageRepo,
      agentRegistry: mockRegistry,
    });

    const result = await engine.runTask(taskId, {
      concurrency: 2,
      fast: true,
    });

    expect(result.taskStatus).toBe('done');
    expect(result.nodesCompleted).toBe(3);
    expect(result.finalArtifact).toBeDefined();
    expect(existsSync(result.finalArtifact!.path)).toBe(true);

    const content = readFileSync(result.finalArtifact!.path, 'utf-8');
    expect(content).toContain('Competitive Brief');
  }, 20000);

  it('runs real LLM mode using injected mocked LLM provider without network (Test 17)', async () => {
    const realTaskId = 'task_real_llm_mode_2';

    await taskRepo.create({
      id: realTaskId,
      title: 'Real Mode Injected LLM Task',
      goal: 'Create competitive brief on AI-agent security startups',
      status: 'ready',
      createdBy: 'operator',
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    });

    const now = getTimestamp();
    const taskNodes: TaskNode[] = [
      {
        id: `${realTaskId}_node_1_res`,
        taskId: realTaskId,
        title: 'Market Research',
        description: 'Discover vendors',
        assignedAgentRole: 'researcher',
        dependsOn: [],
        status: 'pending',
        acceptanceCriteria: ['Discover vendors'],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: `${realTaskId}_node_2_ana`,
        taskId: realTaskId,
        title: 'Analysis',
        description: 'Analyze vectors',
        assignedAgentRole: 'analyst',
        dependsOn: [`${realTaskId}_node_1_res`],
        status: 'pending',
        acceptanceCriteria: ['Compare architectures'],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: `${realTaskId}_node_3_wri`,
        taskId: realTaskId,
        title: 'Writer',
        description: 'Draft brief',
        assignedAgentRole: 'writer',
        dependsOn: [`${realTaskId}_node_1_res`, `${realTaskId}_node_2_ana`],
        status: 'pending',
        acceptanceCriteria: ['Draft 7 sections'],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: `${realTaskId}_node_4_rev`,
        taskId: realTaskId,
        title: 'Reviewer',
        description: 'Audit deliverable',
        assignedAgentRole: 'reviewer',
        dependsOn: [`${realTaskId}_node_3_wri`],
        status: 'pending',
        acceptanceCriteria: ['Approve deliverable'],
        createdAt: now,
        updatedAt: now,
      },
    ];

    await taskNodeRepo.createMany(taskNodes);

    // Setup MockSpecialistProvider responses tailored to each specialist
    const mockLlm = new MockSpecialistProvider();

    // 1. Researcher response
    mockLlm.enqueueResponse({
      text: JSON.stringify({
        objective: 'Analyze startup security offerings',
        findings: [
          {
            name: 'PromptArmor',
            category: 'Honeypots',
            summary: 'Prompt injection defense traps',
            sourceUrls: ['https://promptarmor.com'],
          },
          {
            name: 'Lakera AI',
            category: 'Firewall',
            summary: 'API guardrails for tool execution',
            sourceUrls: ['https://lakera.ai'],
          },
        ],
        openQuestions: ['Multi-agent trust boundaries'],
      }),
    });

    // 2. Analyst response
    mockLlm.enqueueResponse({
      text: JSON.stringify({
        companies: [
          {
            name: 'PromptArmor',
            category: 'Honeypots',
            targetCustomer: 'Enterprises',
            securityApproach: 'Reverse-proxy honeypots',
            deploymentModel: 'cloud',
            strengths: ['Low latency'],
            weaknesses: ['Single-model focus'],
            sources: ['https://promptarmor.com'],
          },
        ],
        gaps: ['Ephemeral credentials lacking'],
        recommendations: ['Deploy proxy firewalls'],
      }),
    });

    // 3. Writer response
    mockLlm.enqueueResponse({
      text: `# Competitive Brief: AI-Agent Security Startups

## Executive Summary
Comprehensive evaluation of emerging agent firewall vendors.

## Comparison Table
| Startup | Approach | Latency |
| :--- | :--- | :--- |
| PromptArmor | Honeypots | 12ms |

## Key Findings
1. Autonomous tool calling creates unconstrained attack surfaces.

## Gaps
- Cross-agent credential scoping is underdeveloped.

## Recommendations
1. Mandate dynamic token down-scoping.

## Sources
- https://owasp.org/llm
`,
    });

    // 4. Reviewer response
    mockLlm.enqueueResponse({
      text: JSON.stringify({
        verdict: 'approve',
        score: 96,
        issues: [],
        requiredChanges: [],
      }),
    });

    const realSpecialistRegistry = createSpecialistAgentRegistry({ mock: false });

    const engine = new ExecutionEngine({
      taskRepo,
      taskNodeRepo,
      artifactService,
      eventBus,
      llmProvider: mockLlm,
      usageRepo,
      agentRegistry: realSpecialistRegistry,
    });

    const result = await engine.runTask(realTaskId, {
      concurrency: 2,
      fast: true,
    });

    expect(result.taskStatus).toBe('done');
    expect(result.nodesCompleted).toBe(4);
    expect(result.finalArtifact).toBeDefined();

    const briefContent = readFileSync(result.finalArtifact!.path, 'utf-8');
    expect(briefContent).toContain('Executive Summary');
    expect(briefContent).toContain('Comparison Table');
    expect(briefContent).toContain('Recommendations');

    // Verify usage was persisted to SQLite usage_records table
    const records = await usageRepo.listByTaskId(realTaskId);
    expect(records.length).toBeGreaterThan(0);
    expect(records[0].model).toBeDefined();
  }, 30000);
});
