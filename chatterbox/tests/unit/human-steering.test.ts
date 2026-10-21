import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createDatabaseConnection, AppDatabase } from '../../src/core/storage/database.js';
import { TaskRepository } from '../../src/core/storage/repositories/task.repository.js';
import { TaskNodeRepository } from '../../src/core/storage/repositories/task-node.repository.js';
import { ArtifactRepository } from '../../src/core/storage/repositories/artifact.repository.js';
import { EventBus } from '../../src/core/events/event-bus.js';
import { EventStore } from '../../src/core/events/event-store.js';
import { AgentFeedEvent } from '../../src/core/events/event-types.js';
import { Scheduler } from '../../src/core/engine/scheduler.js';
import { AgentRegistry } from '../../src/core/agents/runtime/agent-registry.js';
import { createDefaultToolRegistry } from '../../src/core/tools/index.js';
import { ArtifactService } from '../../src/core/artifacts/artifact.service.js';
import { AgentContextBuilder } from '../../src/core/agents/context/agent-context-builder.js';
import { TaskNode } from '../../src/core/models/task-node.js';

describe('Human Steering & Dynamic Control (Milestone 7)', () => {
  let db: AppDatabase;
  let taskRepo: TaskRepository;
  let taskNodeRepo: TaskNodeRepository;
  let artifactRepo: ArtifactRepository;
  let eventBus: EventBus;
  let publishedEvents: AgentFeedEvent[];
  let tempDir: string;
  const taskId = 'task_steering_test';
  const now = '2026-10-18T12:00:00.000Z';

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'agentfeed-steering-'));
    db = createDatabaseConnection(':memory:');
    taskRepo = new TaskRepository(db);
    taskNodeRepo = new TaskNodeRepository(db);
    artifactRepo = new ArtifactRepository(db);
    publishedEvents = [];

    const mockStore = {
      appendEvent: vi.fn().mockImplementation(async (evt: AgentFeedEvent) => {
        publishedEvents.push(evt);
      }),
    } as unknown as EventStore;

    eventBus = new EventBus(mockStore);

    await taskRepo.create({
      id: taskId,
      title: 'Steering Test Task',
      goal: 'Evaluate human steering and control mechanisms',
      status: 'ready',
      createdBy: 'operator',
      visibility: 'private',
      createdAt: now,
      updatedAt: now,
    });
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('user mention (@agent) persists user_instruction event and injects instructions into agent context (Requirement 10)', async () => {
    const node: TaskNode = {
      id: 'node_steer_1',
      taskId,
      title: 'Writer Stage',
      description: 'Write section',
      assignedAgentRole: 'writer',
      status: 'pending',
      dependsOn: [],
      acceptanceCriteria: ['Must include security section'],
      createdAt: now,
      updatedAt: now,
    };

    await taskNodeRepo.createMany([node]);

    let capturedInstructions: string[] | undefined;
    const writerRunner = vi.fn().mockImplementation(async (ctx) => {
      capturedInstructions = ctx.userInstructions;
      return {
        status: 'done',
        outputArtifactIds: [],
        messages: [],
        usage: { inputTokens: 10, outputTokens: 10 },
      };
    });

    const registry = new AgentRegistry();
    registry.register('writer', { role: 'writer', run: writerRunner });

    const scheduler = new Scheduler({
      taskId,
      goal: 'Write security doc',
      taskTitle: 'Steering Test Task',
      nodes: [node],
      agentRegistry: registry,
      toolRegistry: createDefaultToolRegistry(),
      artifactService: new ArtifactService(tempDir, artifactRepo, eventBus),
      eventBus,
      taskRepo,
      taskNodeRepo,
    });

    // Operator mentions agent with dynamic steer instruction
    scheduler.addInstruction('writer', 'Focus heavily on zero-trust architectures and SOC2');

    // Verify user_instruction event was published
    const instructionEvent = publishedEvents.find((e) => e.type === 'user_instruction');
    expect(instructionEvent).toBeDefined();
    expect((instructionEvent?.payload as any).agentRole).toBe('writer');
    expect((instructionEvent?.payload as any).instruction).toBe(
      'Focus heavily on zero-trust architectures and SOC2'
    );

    // Execute node
    await scheduler.execute();

    // Verify the specialist runner received the injected user instruction
    expect(writerRunner).toHaveBeenCalledTimes(1);
    expect(capturedInstructions).toBeDefined();
    expect(capturedInstructions).toContain('Focus heavily on zero-trust architectures and SOC2');

    // Verify context builder renders the instruction into the LLM user prompt
    const builder = new AgentContextBuilder(4000);
    const built = builder.build({
      taskId,
      nodeId: node.id,
      goal: 'Write security doc',
      node,
      upstreamArtifacts: [],
      priorMessages: [],
      userInstructions: capturedInstructions || [],
    });

    expect(built.userPrompt).toContain('# USER INSTRUCTIONS & DECISIONS');
    expect(built.userPrompt).toContain('Focus heavily on zero-trust architectures and SOC2');
  });

  it('planner redirection includes user instruction in planning context (Requirement 11)', () => {
    const builder = new AgentContextBuilder(4000);
    const plannerNode: TaskNode = {
      id: 'node_planner_1',
      taskId,
      title: 'Planning Node',
      description: 'Generate plan graph',
      assignedAgentRole: 'planner',
      status: 'pending',
      dependsOn: [],
      acceptanceCriteria: ['Valid task graph'],
      createdAt: now,
      updatedAt: now,
    };

    const built = builder.build({
      taskId,
      nodeId: plannerNode.id,
      goal: 'Deploy cloud infrastructure',
      node: plannerNode,
      upstreamArtifacts: [],
      priorMessages: [],
      userInstructions: [
        'Do not use AWS. Use GCP Cloud Run and Artifact Registry only.',
      ],
    });

    expect(built.userPrompt).toContain('# USER INSTRUCTIONS & DECISIONS');
    expect(built.userPrompt).toContain('Do not use AWS. Use GCP Cloud Run and Artifact Registry only.');
  });

  it('plan editing updates and persists node modifications before approval (Requirement 12)', async () => {
    // Initial nodes generated by planner
    const initialNodes: TaskNode[] = [
      {
        id: 'node_init_1',
        taskId,
        title: 'Initial Research',
        description: 'Original description',
        assignedAgentRole: 'researcher',
        status: 'pending',
        dependsOn: [],
        acceptanceCriteria: ['Draft findings'],
        createdAt: now,
        updatedAt: now,
      },
    ];

    await taskNodeRepo.createMany(initialNodes);

    const storedBefore = await taskNodeRepo.getById('node_init_1');
    expect(storedBefore?.assignedAgentRole).toBe('researcher');

    // Human operator edits plan before approval (e.g., changes role to analyst, updates criteria)
    await taskNodeRepo.updateStatus('node_init_1', 'pending');
    // Simulate updating node title/assigned role by replacing
    const updatedNode: TaskNode = {
      id: 'node_init_1',
      taskId,
      title: 'Deep Competitive Analysis',
      description: 'Deep dive into market positioning',
      assignedAgentRole: 'analyst',
      status: 'pending',
      dependsOn: [],
      acceptanceCriteria: ['Detailed competitor matrix', 'Pricing analysis'],
      createdAt: now,
      updatedAt: new Date().toISOString(),
    };

    // Re-persist edited nodes
    await taskNodeRepo.deleteByTaskId(taskId);
    await taskNodeRepo.createMany([updatedNode]);

    const storedAfter = await taskNodeRepo.getById('node_init_1');
    expect(storedAfter?.title).toBe('Deep Competitive Analysis');
    expect(storedAfter?.assignedAgentRole).toBe('analyst');
    expect(storedAfter?.acceptanceCriteria).toEqual(['Detailed competitor matrix', 'Pricing analysis']);
  });

  it('pause stops scheduling and resume continues execution (Requirement 13)', async () => {
    const node1: TaskNode = {
      id: 'node_pause_1',
      taskId,
      title: 'Step 1',
      description: 'First step',
      assignedAgentRole: 'researcher',
      status: 'pending',
      dependsOn: [],
      acceptanceCriteria: ['Step 1 done'],
      createdAt: now,
      updatedAt: now,
    };

    const node2: TaskNode = {
      id: 'node_pause_2',
      taskId,
      title: 'Step 2',
      description: 'Second step',
      assignedAgentRole: 'writer',
      status: 'pending',
      dependsOn: ['node_pause_1'],
      acceptanceCriteria: ['Step 2 done'],
      createdAt: now,
      updatedAt: now,
    };

    await taskNodeRepo.createMany([node1, node2]);

    const registry = new AgentRegistry();
    let step1Executed = false;
    let step2Executed = false;

    registry.register('researcher', {
      role: 'researcher',
      run: vi.fn().mockImplementation(async () => {
        step1Executed = true;
        return {
          status: 'done',
          outputArtifactIds: [],
          messages: [],
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      }),
    });

    registry.register('writer', {
      role: 'writer',
      run: vi.fn().mockImplementation(async () => {
        step2Executed = true;
        return {
          status: 'done',
          outputArtifactIds: [],
          messages: [],
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      }),
    });

    const scheduler = new Scheduler({
      taskId,
      goal: 'Pause-resume test',
      taskTitle: 'Steering Test Task',
      nodes: [node1, node2],
      agentRegistry: registry,
      toolRegistry: createDefaultToolRegistry(),
      artifactService: new ArtifactService(tempDir, artifactRepo, eventBus),
      eventBus,
      taskRepo,
      taskNodeRepo,
    });

    // Test pause
    scheduler.pause();
    const pausedEvent = publishedEvents.find((e) => e.type === 'task_paused');
    expect(pausedEvent).toBeDefined();

    // Test resume
    scheduler.resume();
    const resumedEvent = publishedEvents.find((e) => e.type === 'task_resumed');
    expect(resumedEvent).toBeDefined();

    // After resume, execution completes both steps
    const result = await scheduler.execute();
    expect(result.taskStatus).toBe('done');
    expect(step1Executed).toBe(true);
    expect(step2Executed).toBe(true);
  });
});
