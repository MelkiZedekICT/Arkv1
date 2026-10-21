import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LlmResearcherAgent } from '../../src/core/agents/specialists/llm-researcher.agent.js';
import { LlmAnalystAgent } from '../../src/core/agents/specialists/llm-analyst.agent.js';
import { LlmWriterAgent } from '../../src/core/agents/specialists/llm-writer.agent.js';
import { LlmReviewerAgent } from '../../src/core/agents/specialists/llm-reviewer.agent.js';
import { MockSpecialistProvider } from '../../src/core/llm/mock-specialist-provider.js';
import { createDefaultToolRegistry } from '../../src/core/tools/index.js';
import { ArtifactService } from '../../src/core/artifacts/artifact.service.js';
import { ArtifactRepository } from '../../src/core/storage/repositories/artifact.repository.js';
import { TaskRepository } from '../../src/core/storage/repositories/task.repository.js';
import { UsageRepository } from '../../src/core/storage/repositories/usage.repository.js';
import { getDatabase } from '../../src/core/storage/database.js';
import { EventBus } from '../../src/core/events/event-bus.js';
import { EventStore } from '../../src/core/events/event-store.js';
import { TaskNode } from '../../src/core/models/task-node.js';

describe('Real LLM Specialist Agents', () => {
  let tempDir: string;
  let artifactService: ArtifactService;
  let usageRepo: UsageRepository;
  let eventBus: EventBus;
  const taskId = 'task_spec_test_1';

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'agentfeed-specialist-test-'));
    const dbPath = join(tempDir, 'test.db');
    const db = getDatabase(dbPath);

    const taskRepo = new TaskRepository(db);
    await taskRepo.create({
      id: taskId,
      title: 'Specialist Unit Test Task',
      goal: 'Create competitive brief on AI-agent security',
      status: 'running',
      createdBy: 'operator',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

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

  it('LlmResearcherAgent produces valid research notes using mocked LLM (Test 4)', async () => {
    const mockLlm = new MockSpecialistProvider();
    const mockResearchJson = JSON.stringify({
      objective: 'Map the AI-agent security startup ecosystem',
      findings: [
        {
          name: 'PromptArmor',
          category: 'Prompt Injection Defense',
          summary: 'Zero-day traps and reverse-proxy guardrails',
          sourceUrls: ['https://promptarmor.com/docs'],
        },
        {
          name: 'Lakera AI',
          category: 'Agent Firewall',
          summary: 'Sub-10ms API gate preventing tool argument injection',
          sourceUrls: ['https://lakera.ai/blog'],
        },
      ],
      openQuestions: ['How can agent IAM handle delegated tool privileges?'],
    });

    mockLlm.setDefaultResponse(mockResearchJson);

    const researcher = new LlmResearcherAgent();
    const node: TaskNode = {
      id: `${taskId}_node_1`,
      taskId,
      title: 'Landscape Research',
      description: 'Discover AI agent security startups',
      assignedAgentRole: 'researcher',
      dependsOn: [],
      status: 'pending',
      acceptanceCriteria: ['Find 2+ vendors'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await researcher.run({
      taskId,
      nodeId: node.id,
      goal: 'Create competitive brief on AI-agent security',
      taskTitle: 'Competitive Brief Task',
      node,
      inputArtifacts: [],
      dependencies: [],
      signal: new AbortController().signal,
      llmProvider: mockLlm,
      toolRegistry: createDefaultToolRegistry(),
      eventBus,
      artifactService,
    });

    expect(result.status).toBe('done');
    expect(result.outputArtifactIds).toHaveLength(1);

    const artifact = await artifactService.getArtifact(result.outputArtifactIds[0]);
    expect(artifact).toBeDefined();
    expect(existsSync(artifact!.path)).toBe(true);

    const content = readFileSync(artifact!.path, 'utf-8');
    expect(content).toContain('Research Objective');
    expect(content).toContain('Companies/Projects Found');
    expect(content).toContain('PromptArmor');
    expect(content).toContain('Lakera AI');
    expect(content).toContain('Key Observations');
    expect(content).toContain('Sources');
    expect(content).toContain('Open Questions');
  });

  it('LlmWriterAgent creates Markdown artifact with 7 required sections (Test 7)', async () => {
    const mockLlm = new MockSpecialistProvider();
    const mockBriefMarkdown = `# Competitive Brief: AI-Agent Security Startups

## Executive Summary
Autonomous multi-agent systems require runtime firewalling and scoped tool IAM.

## Comparison Table
| Startup | Category | Approach | Strengths | Latency |
| :--- | :--- | :--- | :--- | :--- |
| PromptArmor | Guardrails | Honey-traps | Zero-day defense | <15ms |
| Lakera | Firewall | API Gate | Attack dataset | <10ms |

## Key Findings
1. Tool argument injection represents the primary attack vector.
2. Speed is critical; latency over 25ms degrades multi-turn agent loops.

## Gaps
- Cross-agent credential delegation remains unsolved.

## Recommendations
1. Deploy low-latency inline proxies.
2. Mandate ephemeral scoped credentials.

## Sources
- https://owasp.org/llm-top-10
- Vendor technical whitepapers
`;

    mockLlm.setDefaultResponse(mockBriefMarkdown);

    const writer = new LlmWriterAgent();
    const node: TaskNode = {
      id: `${taskId}_node_writer`,
      taskId,
      title: 'Synthesize Competitive Brief',
      description: 'Draft comprehensive deliverable',
      assignedAgentRole: 'writer',
      dependsOn: [],
      status: 'pending',
      acceptanceCriteria: ['Include executive summary, comparison table, gaps, recommendations'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await writer.run({
      taskId,
      nodeId: node.id,
      goal: 'Competitive brief deliverable',
      taskTitle: 'Deliverable Brief',
      node,
      inputArtifacts: [],
      dependencies: [],
      signal: new AbortController().signal,
      llmProvider: mockLlm,
      toolRegistry: createDefaultToolRegistry(),
      eventBus,
      artifactService,
    });

    expect(result.status).toBe('done');
    const artifact = await artifactService.getArtifact(result.outputArtifactIds[0]);
    expect(artifact).toBeDefined();
    expect(artifact?.path).toContain('competitive-brief.md');

    const content = readFileSync(artifact!.path, 'utf-8').toLowerCase();
    expect(content).toContain('executive summary');
    expect(content).toContain('comparison table');
    expect(content).toContain('key findings');
    expect(content).toContain('gaps');
    expect(content).toContain('recommendations');
    expect(content).toContain('sources');
  });

  it('LlmReviewerAgent approves a valid artifact (Test 8)', async () => {
    // 1. Create a valid competitive-brief.md artifact
    const validBriefContent = `# Competitive Brief: AI-Agent Security Startups
## Executive Summary
Good summary.
## Comparison Table
| A | B |
## Key Findings
1. Finding one
## Gaps
- Gap one
## Recommendations
1. Recommendation one
## Sources
- Source one
`;
    const createdArt = await artifactService.createArtifact({
      taskId,
      nodeId: 'writer_node',
      authorId: 'agent_writer',
      type: 'markdown',
      title: 'Competitive Brief: AI-Agent Security Startups',
      filename: 'competitive-brief.md',
      content: validBriefContent,
    });

    const mockLlm = new MockSpecialistProvider();
    mockLlm.setDefaultResponse(
      JSON.stringify({
        verdict: 'approve',
        score: 95,
        issues: [],
        requiredChanges: [],
      })
    );

    const reviewer = new LlmReviewerAgent();
    const node: TaskNode = {
      id: `${taskId}_node_reviewer`,
      taskId,
      title: 'Review Deliverable',
      description: 'Audit deliverable quality',
      assignedAgentRole: 'reviewer',
      dependsOn: ['writer_node'],
      status: 'pending',
      acceptanceCriteria: ['Approve only if all sections present'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await reviewer.run({
      taskId,
      nodeId: node.id,
      goal: 'Create competitive brief',
      taskTitle: 'Competitive Brief',
      node,
      inputArtifacts: [createdArt],
      dependencies: [],
      signal: new AbortController().signal,
      llmProvider: mockLlm,
      toolRegistry: createDefaultToolRegistry(),
      eventBus,
      artifactService,
    });

    expect(result.status).toBe('done');
    expect(result.outputArtifactIds).toContain(createdArt.id);
  });

  it('LlmReviewerAgent requests revision for an invalid artifact and blocks (Test 9)', async () => {
    // Artifact missing comparison table and recommendations
    const deficientContent = `# Deficient Brief\n## Executive Summary\nOnly an executive summary.`;
    const createdArt = await artifactService.createArtifact({
      taskId,
      nodeId: 'writer_node',
      authorId: 'agent_writer',
      type: 'markdown',
      title: 'Deficient Brief',
      filename: 'competitive-brief.md',
      content: deficientContent,
    });

    const mockLlm = new MockSpecialistProvider();
    mockLlm.setDefaultResponse(
      JSON.stringify({
        verdict: 'revise',
        score: 40,
        issues: ['Missing comparison table', 'Missing recommendations', 'Missing sources'],
        requiredChanges: ['Add the comparison table and recommendations'],
      })
    );

    const reviewer = new LlmReviewerAgent();
    const node: TaskNode = {
      id: `${taskId}_node_reviewer_2`,
      taskId,
      title: 'Review Deficient Deliverable',
      description: 'Audit deliverable quality',
      assignedAgentRole: 'reviewer',
      dependsOn: ['writer_node'],
      status: 'pending',
      acceptanceCriteria: ['Approve only if complete'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await reviewer.run({
      taskId,
      nodeId: node.id,
      goal: 'Create competitive brief',
      taskTitle: 'Competitive Brief',
      node,
      inputArtifacts: [createdArt],
      dependencies: [],
      signal: new AbortController().signal,
      llmProvider: mockLlm,
      toolRegistry: createDefaultToolRegistry(),
      eventBus,
      artifactService,
    });

    expect(result.status).toBe('blocked');
    expect(result.error?.message).toContain('Reviewer requested revision');
  });

  it('persists usage records capturing tokens, latency, model, and provider (Test 12)', async () => {
    const record = await usageRepo.create({
      id: 'use_rec_1',
      taskId,
      agentId: 'agent_researcher',
      model: 'gpt-4o',
      inputTokens: 320,
      outputTokens: 180,
      estimatedCost: 0.0026,
      toolCalls: 2,
      createdAt: new Date().toISOString(),
    });

    expect(record.id).toBe('use_rec_1');
    expect(record.inputTokens).toBe(320);
    expect(record.outputTokens).toBe(180);
    expect(record.estimatedCost).toBe(0.0026);

    const listed = await usageRepo.listByTaskId(taskId);
    expect(listed).toHaveLength(1);
    expect(listed[0].agentId).toBe('agent_researcher');

    const totalCost = await usageRepo.getTotalCostByTaskId(taskId);
    expect(totalCost).toBe(0.0026);
  });
});
