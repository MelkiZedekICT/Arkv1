import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getDatabase, AppDatabase } from '../../src/core/storage/database.js';
import { ArtifactRepository } from '../../src/core/storage/repositories/artifact.repository.js';
import { TaskRepository } from '../../src/core/storage/repositories/task.repository.js';
import { EventStore } from '../../src/core/events/event-store.js';
import { EventBus } from '../../src/core/events/event-bus.js';
import { ArtifactService } from '../../src/core/artifacts/artifact.service.js';
import { createDefaultToolRegistry } from '../../src/core/tools/index.js';
import { MockPlannerProvider } from '../../src/core/llm/mock-planner-provider.js';
import { MockResearcherAgent } from '../../src/core/agents/specialists/mock-researcher.agent.js';
import { MockAnalystAgent } from '../../src/core/agents/specialists/mock-analyst.agent.js';
import { MockWriterAgent } from '../../src/core/agents/specialists/mock-writer.agent.js';
import { MockReviewerAgent } from '../../src/core/agents/specialists/mock-reviewer.agent.js';
import { TaskNode } from '../../src/core/models/task-node.js';
import { AgentFeedEvent } from '../../src/core/events/event-types.js';
import { getTimestamp } from '../../src/utils/time.js';

describe('Mock Specialist Agents', () => {
  let tempDir: string;
  let db: AppDatabase;
  let artifactRepo: ArtifactRepository;
  let taskRepo: TaskRepository;
  let eventStore: EventStore;
  let eventBus: EventBus;
  let artifactService: ArtifactService;
  const taskId = 'task_agent_test';

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'agentfeed-agents-test-'));
    db = getDatabase(join(tempDir, 'test.db'));
    artifactRepo = new ArtifactRepository(db);
    taskRepo = new TaskRepository(db);
    eventStore = new EventStore(tempDir);
    eventBus = new EventBus(eventStore);
    artifactService = new ArtifactService(tempDir, artifactRepo, eventBus);

    await taskRepo.create({
      id: taskId,
      title: 'Agent Testing Task',
      goal: 'Create competitive brief on AI-agent security startups',
      status: 'running',
      createdBy: 'operator',
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

  it('publishes required event sequence from Researcher agent (Test 9)', async () => {
    const researcher = new MockResearcherAgent();
    const toolRegistry = createDefaultToolRegistry();
    const llmProvider = new MockPlannerProvider();

    const events: AgentFeedEvent[] = [];
    eventBus.on('*', (e) => events.push(e));

    const node: TaskNode = {
      id: `${taskId}_node_1`,
      taskId,
      title: 'Research AI Security Landscape',
      description: 'Find top startups',
      assignedAgentRole: 'researcher',
      dependsOn: [],
      status: 'pending',
      acceptanceCriteria: ['Collect 5 vendors'],
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    };

    const result = await researcher.run({
      taskId,
      nodeId: node.id,
      goal: 'Competitive brief on AI-agent security',
      taskTitle: 'Competitive Brief Task',
      node,
      inputArtifacts: [],
      dependencies: [],
      signal: new AbortController().signal,
      llmProvider,
      toolRegistry,
      eventBus,
      artifactService,
      fast: true,
    });

    expect(result.status).toBe('done');
    expect(result.outputArtifactIds.length).toBe(1);

    const types = events.map((e) => e.type);
    expect(types).toContain('node_started');
    expect(types).toContain('agent_message');
    expect(types).toContain('tool_call_started');
    expect(types).toContain('tool_call_completed');
    expect(types).toContain('artifact_created');
    expect(types).toContain('node_completed');
  });

  it('MockAnalystAgent fails if required input artifacts are missing', async () => {
    const analyst = new MockAnalystAgent();
    const toolRegistry = createDefaultToolRegistry();
    const llmProvider = new MockPlannerProvider();

    const node: TaskNode = {
      id: `${taskId}_node_2`,
      taskId,
      title: 'Extract key dimensions',
      description: 'Analyze data',
      assignedAgentRole: 'analyst',
      dependsOn: [`${taskId}_node_1`],
      status: 'pending',
      acceptanceCriteria: ['Matrix'],
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    };

    const result = await analyst.run({
      taskId,
      nodeId: node.id,
      goal: 'Analyze startups',
      taskTitle: 'Analysis Task',
      node,
      inputArtifacts: [], // Missing!
      dependencies: [],
      signal: new AbortController().signal,
      llmProvider,
      toolRegistry,
      eventBus,
      artifactService,
      fast: true,
    });

    expect(result.status).toBe('failed');
    expect(result.error).toBeDefined();
    expect(result.error?.message).toMatch(/requires upstream research artifacts/i);
    expect(result.error?.isTransient).toBe(false);
  });

  it('MockWriterAgent generates deliverable with all required sections (Test 10)', async () => {
    const writer = new MockWriterAgent();
    const toolRegistry = createDefaultToolRegistry();
    const llmProvider = new MockPlannerProvider();

    // Create upstream dummy research artifact
    const dummyArt = await artifactService.createArtifact({
      taskId,
      authorId: 'agent_researcher',
      type: 'markdown',
      title: 'Research Notes',
      filename: 'research-notes.md',
      content: 'Sample research data.',
    });

    const node: TaskNode = {
      id: `${taskId}_node_4`,
      taskId,
      title: 'Draft competitive brief',
      description: 'Executive deliverable',
      assignedAgentRole: 'writer',
      dependsOn: [`${taskId}_node_3`],
      status: 'pending',
      acceptanceCriteria: ['Executive report'],
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    };

    const result = await writer.run({
      taskId,
      nodeId: node.id,
      goal: 'Competitive brief on AI-agent security',
      taskTitle: 'Competitive Brief Deliverable',
      node,
      inputArtifacts: [dummyArt],
      dependencies: [],
      signal: new AbortController().signal,
      llmProvider,
      toolRegistry,
      eventBus,
      artifactService,
      fast: true,
    });

    expect(result.status).toBe('done');
    expect(result.outputArtifactIds.length).toBe(1);

    const artifactContent = await artifactService.readArtifactContent(result.outputArtifactIds[0]);

    // Check all 7 required sections:
    // Title, Executive summary, Comparison table, Key findings, Gaps, Recommendations, Sources
    expect(artifactContent.toLowerCase()).toContain('# competitive brief');
    expect(artifactContent.toLowerCase()).toContain('## executive summary');
    expect(artifactContent.toLowerCase()).toContain('## comparison table');
    expect(artifactContent.toLowerCase()).toContain('## key findings');
    expect(artifactContent.toLowerCase()).toContain('## gaps');
    expect(artifactContent.toLowerCase()).toContain('## recommendations');
    expect(artifactContent.toLowerCase()).toContain('## sources');
  });

  it('MockReviewerAgent validates writer deliverable and approves', async () => {
    const reviewer = new MockReviewerAgent();
    const writer = new MockWriterAgent();
    const toolRegistry = createDefaultToolRegistry();
    const llmProvider = new MockPlannerProvider();

    // 1. Create deliverable using writer
    const writerNode: TaskNode = {
      id: `${taskId}_node_writer`,
      taskId,
      title: 'Draft brief',
      description: 'Writer node',
      assignedAgentRole: 'writer',
      dependsOn: [],
      status: 'pending',
      acceptanceCriteria: ['Brief'],
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    };

    const writerResult = await writer.run({
      taskId,
      nodeId: writerNode.id,
      goal: 'Create competitive brief',
      taskTitle: 'Task Title',
      node: writerNode,
      inputArtifacts: [],
      dependencies: [],
      signal: new AbortController().signal,
      llmProvider,
      toolRegistry,
      eventBus,
      artifactService,
      fast: true,
    });

    const briefArtifact = await artifactService.getArtifact(writerResult.outputArtifactIds[0]);
    expect(briefArtifact).toBeDefined();

    // 2. Run Reviewer
    const reviewerNode: TaskNode = {
      id: `${taskId}_node_reviewer`,
      taskId,
      title: 'Review brief',
      description: 'Reviewer node',
      assignedAgentRole: 'reviewer',
      dependsOn: [writerNode.id],
      status: 'pending',
      acceptanceCriteria: ['Audit pass'],
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    };

    const reviewResult = await reviewer.run({
      taskId,
      nodeId: reviewerNode.id,
      goal: 'Audit brief',
      taskTitle: 'Task Title',
      node: reviewerNode,
      inputArtifacts: [briefArtifact!],
      dependencies: [writerNode],
      signal: new AbortController().signal,
      llmProvider,
      toolRegistry,
      eventBus,
      artifactService,
      fast: true,
    });

    expect(reviewResult.status).toBe('done');
  });
});
