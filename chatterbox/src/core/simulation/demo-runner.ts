import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { TaskService } from '../task/task.service.js';
import { TaskNodeRepository } from '../storage/repositories/task-node.repository.js';
import { ArtifactRepository } from '../storage/repositories/artifact.repository.js';
import { ApprovalRepository } from '../storage/repositories/approval.repository.js';
import { EventBus } from '../events/event-bus.js';
import { generateId } from '../../utils/ids.js';
import { getTimestamp } from '../../utils/time.js';
import {
  DEMO_TASK_GOAL,
  DEMO_TASK_TITLE,
  DEMO_NODES,
  DEMO_ARTIFACT_CONTENT,
} from './demo-scenario.js';
import { Task } from '../models/task.js';
import { TaskNode } from '../models/task-node.js';

export interface DemoRunnerOptions {
  taskService: TaskService;
  taskNodeRepo: TaskNodeRepository;
  artifactRepo: ArtifactRepository;
  approvalRepo: ApprovalRepository;
  eventBus: EventBus;
  storageDir: string;
  fast?: boolean;
  noApprove?: boolean;
}

export class DemoRunner {
  private isPaused = false;
  private isStopped = false;
  private isCompleted = false;
  private awaitingApproval = false;
  private approvalResolver: ((approved: boolean) => void) | null = null;
  private currentTaskId: string | null = null;
  private currentApprovalId: string = 'appr_demo_final';

  constructor(private options: DemoRunnerOptions) {}

  get taskId(): string | null {
    return this.currentTaskId;
  }

  get paused(): boolean {
    return this.isPaused;
  }

  get stopped(): boolean {
    return this.isStopped;
  }

  get completed(): boolean {
    return this.isCompleted;
  }

  get isAwaitingApproval(): boolean {
    return this.awaitingApproval;
  }

  private async sleep(ms: number): Promise<void> {
    const adjusted = this.options.fast ? Math.max(25, Math.floor(ms / 10)) : ms;
    const interval = 50;
    let elapsed = 0;

    while (elapsed < adjusted && !this.isStopped) {
      if (!this.isPaused) {
        elapsed += interval;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }

  pause(): void {
    if (this.isPaused || this.isStopped || !this.currentTaskId) return;
    this.isPaused = true;
    void this.options.eventBus.publish({
      eventId: generateId('evt'),
      taskId: this.currentTaskId,
      type: 'task_paused',
      timestamp: getTimestamp(),
      actorType: 'user',
      actorId: 'user_local',
      correlationId: generateId('corr'),
      payload: { reason: 'User paused execution' },
    });
  }

  resume(): void {
    if (!this.isPaused || this.isStopped || !this.currentTaskId) return;
    this.isPaused = false;
    void this.options.eventBus.publish({
      eventId: generateId('evt'),
      taskId: this.currentTaskId,
      type: 'task_resumed',
      timestamp: getTimestamp(),
      actorType: 'user',
      actorId: 'user_local',
      correlationId: generateId('corr'),
      payload: { reason: 'User resumed execution' },
    });
  }

  approve(reason?: string): void {
    if (this.currentTaskId) {
      void this.options.eventBus.publish({
        eventId: generateId('evt'),
        taskId: this.currentTaskId,
        type: 'approval_granted',
        timestamp: getTimestamp(),
        actorType: 'user',
        actorId: 'user_local',
        correlationId: generateId('corr'),
        payload: {
          approvalId: this.currentApprovalId,
          decidedBy: 'user_local',
          reason: reason || 'Approved by human operator',
        },
      });
    }
    this.awaitingApproval = false;
    if (this.approvalResolver) {
      const resolver = this.approvalResolver;
      this.approvalResolver = null;
      resolver(true);
    }
  }

  reject(reason?: string): void {
    if (this.currentTaskId) {
      void this.options.eventBus.publish({
        eventId: generateId('evt'),
        taskId: this.currentTaskId,
        type: 'approval_denied',
        timestamp: getTimestamp(),
        actorType: 'user',
        actorId: 'user_local',
        correlationId: generateId('corr'),
        payload: {
          approvalId: this.currentApprovalId,
          decidedBy: 'user_local',
          reason: reason || 'Rejected by human operator',
        },
      });
    }
    this.awaitingApproval = false;
    if (this.approvalResolver) {
      const resolver = this.approvalResolver;
      this.approvalResolver = null;
      resolver(false);
    }
  }

  stop(): void {
    this.isStopped = true;
    if (this.approvalResolver) {
      const resolver = this.approvalResolver;
      this.approvalResolver = null;
      resolver(false);
    }
  }

  async run(): Promise<Task> {
    const timestamp = getTimestamp();

    // 1. Create Task
    const task = await this.options.taskService.createTask({
      goal: DEMO_TASK_GOAL,
      title: DEMO_TASK_TITLE,
    });
    this.currentTaskId = task.id;
    this.currentApprovalId = generateId('appr');

    const n1 = `${task.id}_node_1`;
    const n2 = `${task.id}_node_2`;
    const n3 = `${task.id}_node_3`;
    const n4 = `${task.id}_node_4`;
    const n5 = `${task.id}_node_5`;
    const nodeMap: Record<string, string> = {
      node_1: n1,
      node_2: n2,
      node_3: n3,
      node_4: n4,
      node_5: n5,
    };

    // 2. Propose Plan & Create Nodes
    await this.sleep(400);
    if (this.isStopped) return task;

    await this.options.eventBus.publish({
      eventId: generateId('evt'),
      taskId: task.id,
      type: 'plan_proposed',
      timestamp: getTimestamp(),
      actorType: 'agent',
      actorId: 'agent_planner',
      correlationId: generateId('corr'),
      payload: {
        summary: 'Deconstructed goal into 5 specialist task nodes.',
        nodes: DEMO_NODES.map((d) => ({
          ...d,
          id: nodeMap[d.id] || d.id,
          dependsOn: d.dependsOn.map((dep) => nodeMap[dep] || dep),
        })),
      },
    });

    const nodesToCreate: TaskNode[] = DEMO_NODES.map((d) => ({
      id: nodeMap[d.id] || d.id,
      taskId: task.id,
      title: d.title,
      description: d.description,
      assignedAgentRole: d.assignedAgentRole,
      dependsOn: d.dependsOn.map((dep) => nodeMap[dep] || dep),
      status: 'pending',
      acceptanceCriteria: d.acceptanceCriteria,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    await this.options.taskNodeRepo.createMany(nodesToCreate);

    for (const node of DEMO_NODES) {
      await this.options.eventBus.publish({
        eventId: generateId('evt'),
        taskId: task.id,
        type: 'node_created',
        timestamp: getTimestamp(),
        actorType: 'agent',
        actorId: 'agent_planner',
        correlationId: generateId('corr'),
        payload: {
          nodeId: nodeMap[node.id] || node.id,
          title: node.title,
          assignedAgentRole: node.assignedAgentRole,
          dependsOn: node.dependsOn.map((dep) => nodeMap[dep] || dep),
        },
      });
    }

    // Message from planner
    await this.options.eventBus.publish({
      eventId: generateId('evt'),
      taskId: task.id,
      type: 'agent_message',
      timestamp: getTimestamp(),
      actorType: 'agent',
      actorId: 'agent_planner',
      correlationId: generateId('corr'),
      payload: {
        content: 'Proposed 5 tasks and assigned specialist owners based on user goal.',
        kind: 'proposal',
      },
    });

    // 3. Node 1: Research companies (Researcher)
    await this.sleep(800);
    if (this.isStopped) return task;

    await this.options.taskNodeRepo.updateStatus(n1, 'running');
    await this.options.eventBus.publish({
      eventId: generateId('evt'),
      taskId: task.id,
      type: 'node_started',
      timestamp: getTimestamp(),
      actorType: 'system',
      actorId: 'system',
      correlationId: generateId('corr'),
      payload: { nodeId: n1 },
    });

    await this.options.eventBus.publish({
      eventId: generateId('evt'),
      taskId: task.id,
      type: 'agent_message',
      timestamp: getTimestamp(),
      actorType: 'agent',
      actorId: 'agent_researcher',
      correlationId: generateId('corr'),
      payload: {
        nodeId: n1,
        content: 'Searching web for early-stage AI-agent security companies and threat models...',
        kind: 'thought',
      },
    });

    await this.sleep(600);
    if (this.isStopped) return task;

    await this.options.eventBus.publish({
      eventId: generateId('evt'),
      taskId: task.id,
      type: 'tool_call_started',
      timestamp: getTimestamp(),
      actorType: 'agent',
      actorId: 'agent_researcher',
      correlationId: generateId('corr'),
      payload: {
        nodeId: n1,
        toolName: 'web_search',
        toolCallId: 'call_search_1',
        input: { query: 'AI agent runtime security startups 2025 2026' },
      },
    });

    await this.sleep(700);
    if (this.isStopped) return task;

    await this.options.eventBus.publish({
      eventId: generateId('evt'),
      taskId: task.id,
      type: 'tool_call_completed',
      timestamp: getTimestamp(),
      actorType: 'agent',
      actorId: 'agent_researcher',
      correlationId: generateId('corr'),
      payload: {
        nodeId: n1,
        toolName: 'web_search',
        toolCallId: 'call_search_1',
        output: { resultsCount: 12, topVendors: ['PromptArmor', 'Lakera', 'Robust Intelligence'] },
        durationMs: 640,
      },
    });

    await this.options.eventBus.publish({
      eventId: generateId('evt'),
      taskId: task.id,
      type: 'agent_message',
      timestamp: getTimestamp(),
      actorType: 'agent',
      actorId: 'agent_researcher',
      correlationId: generateId('corr'),
      payload: {
        nodeId: n1,
        content: 'Found 12 candidate companies specializing in LLM runtime guardrails and agent security.',
        kind: 'result',
      },
    });

    await this.options.taskNodeRepo.updateStatus(n1, 'done');
    await this.options.eventBus.publish({
      eventId: generateId('evt'),
      taskId: task.id,
      type: 'node_completed',
      timestamp: getTimestamp(),
      actorType: 'system',
      actorId: 'system',
      correlationId: generateId('corr'),
      payload: { nodeId: n1, summary: 'Research completed with 12 vendors identified.' },
    });

    // 4. Node 2: Extract structured data (Analyst)
    await this.sleep(800);
    if (this.isStopped) return task;

    await this.options.taskNodeRepo.updateStatus(n2, 'running');
    await this.options.eventBus.publish({
      eventId: generateId('evt'),
      taskId: task.id,
      type: 'node_started',
      timestamp: getTimestamp(),
      actorType: 'system',
      actorId: 'system',
      correlationId: generateId('corr'),
      payload: { nodeId: n2 },
    });

    await this.options.eventBus.publish({
      eventId: generateId('evt'),
      taskId: task.id,
      type: 'agent_message',
      timestamp: getTimestamp(),
      actorType: 'agent',
      actorId: 'agent_analyst',
      correlationId: generateId('corr'),
      payload: {
        nodeId: n2,
        content: '@researcher Please extract deployment model and threat vectors for each company.',
        kind: 'question',
      },
    });

    await this.sleep(700);
    if (this.isStopped) return task;

    await this.options.eventBus.publish({
      eventId: generateId('evt'),
      taskId: task.id,
      type: 'agent_reply',
      timestamp: getTimestamp(),
      actorType: 'agent',
      actorId: 'agent_researcher',
      correlationId: generateId('corr'),
      payload: {
        nodeId: n2,
        replyToMessageId: 'msg_analyst_req',
        content: 'Added deployment architecture and attack vector coverage for all companies.',
      },
    });

    await this.options.eventBus.publish({
      eventId: generateId('evt'),
      taskId: task.id,
      type: 'agent_message',
      timestamp: getTimestamp(),
      actorType: 'agent',
      actorId: 'agent_analyst',
      correlationId: generateId('corr'),
      payload: {
        nodeId: n2,
        content: 'Extracted feature vectors: prompt injection, runtime guardrails, MLSecOps EDR, and supply chain.',
        kind: 'result',
      },
    });

    await this.options.taskNodeRepo.updateStatus(n2, 'done');
    await this.options.eventBus.publish({
      eventId: generateId('evt'),
      taskId: task.id,
      type: 'node_completed',
      timestamp: getTimestamp(),
      actorType: 'system',
      actorId: 'system',
      correlationId: generateId('corr'),
      payload: { nodeId: n2, summary: 'Structured data extraction finished.' },
    });

    // 5. Node 3: Compare competitors (Analyst)
    await this.sleep(800);
    if (this.isStopped) return task;

    await this.options.taskNodeRepo.updateStatus(n3, 'running');
    await this.options.eventBus.publish({
      eventId: generateId('evt'),
      taskId: task.id,
      type: 'node_started',
      timestamp: getTimestamp(),
      actorType: 'system',
      actorId: 'system',
      correlationId: generateId('corr'),
      payload: { nodeId: n3 },
    });

    await this.options.eventBus.publish({
      eventId: generateId('evt'),
      taskId: task.id,
      type: 'agent_message',
      timestamp: getTimestamp(),
      actorType: 'agent',
      actorId: 'agent_analyst',
      correlationId: generateId('corr'),
      payload: {
        nodeId: n3,
        content: 'Cross-analyzing competitive moats and identified 3 key industry white spaces.',
        kind: 'thought',
      },
    });

    await this.options.taskNodeRepo.updateStatus(n3, 'done');
    await this.options.eventBus.publish({
      eventId: generateId('evt'),
      taskId: task.id,
      type: 'node_completed',
      timestamp: getTimestamp(),
      actorType: 'system',
      actorId: 'system',
      correlationId: generateId('corr'),
      payload: { nodeId: n3, summary: 'Competitor comparison matrix built.' },
    });

    // 6. Node 4: Draft brief (Writer)
    await this.sleep(800);
    if (this.isStopped) return task;

    await this.options.taskNodeRepo.updateStatus(n4, 'running');
    await this.options.eventBus.publish({
      eventId: generateId('evt'),
      taskId: task.id,
      type: 'node_started',
      timestamp: getTimestamp(),
      actorType: 'system',
      actorId: 'system',
      correlationId: generateId('corr'),
      payload: { nodeId: n4 },
    });

    await this.options.eventBus.publish({
      eventId: generateId('evt'),
      taskId: task.id,
      type: 'agent_message',
      timestamp: getTimestamp(),
      actorType: 'agent',
      actorId: 'agent_writer',
      correlationId: generateId('corr'),
      payload: {
        nodeId: n4,
        content: 'Drafting competitive brief deliverable with executive summary and gap analysis...',
        kind: 'thought',
      },
    });

    await this.sleep(700);
    if (this.isStopped) return task;

    // Write artifact to disk and database
    const artifactsDir = join(this.options.storageDir, 'artifacts', task.id);
    mkdirSync(artifactsDir, { recursive: true });
    const artifactFilePath = join(artifactsDir, 'competitive-brief.md');
    writeFileSync(artifactFilePath, DEMO_ARTIFACT_CONTENT, 'utf-8');

    const artifactId = generateId('art');
    await this.options.artifactRepo.create({
      id: artifactId,
      taskId: task.id,
      nodeId: n4,
      authorId: 'agent_writer',
      type: 'markdown',
      title: 'Competitive Brief: AI-Agent Security Startups',
      path: artifactFilePath,
      createdAt: getTimestamp(),
    });

    await this.options.eventBus.publish({
      eventId: generateId('evt'),
      taskId: task.id,
      type: 'artifact_created',
      timestamp: getTimestamp(),
      actorType: 'agent',
      actorId: 'agent_writer',
      correlationId: generateId('corr'),
      payload: {
        artifactId,
        nodeId: n4,
        title: 'Competitive Brief: AI-Agent Security Startups',
        type: 'markdown',
        path: artifactFilePath,
      },
    });

    await this.options.eventBus.publish({
      eventId: generateId('evt'),
      taskId: task.id,
      type: 'agent_message',
      timestamp: getTimestamp(),
      actorType: 'agent',
      actorId: 'agent_writer',
      correlationId: generateId('corr'),
      payload: {
        nodeId: n4,
        content: 'Created final artifact: competitive-brief.md (Markdown).',
        kind: 'result',
      },
    });

    await this.options.taskNodeRepo.updateStatus(n4, 'done');
    await this.options.eventBus.publish({
      eventId: generateId('evt'),
      taskId: task.id,
      type: 'node_completed',
      timestamp: getTimestamp(),
      actorType: 'system',
      actorId: 'system',
      correlationId: generateId('corr'),
      payload: { nodeId: n4, outputArtifactId: artifactId, summary: 'Brief drafted.' },
    });

    // 7. Node 5: Review and finalize (Reviewer) - Approval Flow
    await this.sleep(800);
    if (this.isStopped) return task;

    await this.options.taskNodeRepo.updateStatus(n5, 'awaiting_approval');
    await this.options.eventBus.publish({
      eventId: generateId('evt'),
      taskId: task.id,
      type: 'node_started',
      timestamp: getTimestamp(),
      actorType: 'system',
      actorId: 'system',
      correlationId: generateId('corr'),
      payload: { nodeId: n5 },
    });

    await this.options.eventBus.publish({
      eventId: generateId('evt'),
      taskId: task.id,
      type: 'agent_message',
      timestamp: getTimestamp(),
      actorType: 'agent',
      actorId: 'agent_reviewer',
      correlationId: generateId('corr'),
      payload: {
        nodeId: n5,
        content: 'Reviewing deliverable against factual consistency and threat coverage standards.',
        kind: 'thought',
      },
    });

    const approvalId = this.currentApprovalId;
    await this.options.approvalRepo.create({
      id: approvalId,
      taskId: task.id,
      nodeId: n5,
      requestedBy: 'agent_reviewer',
      action: 'Final sign-off on AI-Agent Security Competitive Brief deliverable',
      riskLevel: 'medium',
      status: 'pending',
      createdAt: getTimestamp(),
    });

    await this.options.eventBus.publish({
      eventId: generateId('evt'),
      taskId: task.id,
      type: 'approval_requested',
      timestamp: getTimestamp(),
      actorType: 'agent',
      actorId: 'agent_reviewer',
      correlationId: generateId('corr'),
      payload: {
        approvalId,
        nodeId: n5,
        action: 'Approve final release of Competitive Brief deliverable',
        riskLevel: 'medium',
      },
    });

    // Await human approval unless noApprove is active
    let isApproved = true;
    if (!this.options.noApprove) {
      this.awaitingApproval = true;
      isApproved = await new Promise<boolean>((resolve) => {
        this.approvalResolver = resolve;
      });
    } else {
      await this.sleep(400);
      this.approve('Auto-approved via --no-approve flag');
    }

    if (this.isStopped) return task;

    if (isApproved) {
      await this.options.approvalRepo.updateStatus(approvalId, 'approved', 'Verified by human operator');

      await this.options.eventBus.publish({
        eventId: generateId('evt'),
        taskId: task.id,
        type: 'agent_message',
        timestamp: getTimestamp(),
        actorType: 'agent',
        actorId: 'agent_reviewer',
        correlationId: generateId('corr'),
        payload: {
          nodeId: n5,
          content: 'Human approval confirmed. Deliverable signed off for distribution.',
          kind: 'approval',
        },
      });

      await this.options.taskNodeRepo.updateStatus(n5, 'done');
      await this.options.eventBus.publish({
        eventId: generateId('evt'),
        taskId: task.id,
        type: 'node_completed',
        timestamp: getTimestamp(),
        actorType: 'system',
        actorId: 'system',
        correlationId: generateId('corr'),
        payload: { nodeId: n5, summary: 'Deliverable finalized.' },
      });

      await this.options.eventBus.publish({
        eventId: generateId('evt'),
        taskId: task.id,
        type: 'task_completed',
        timestamp: getTimestamp(),
        actorType: 'system',
        actorId: 'system',
        correlationId: generateId('corr'),
        payload: {
          deliverableArtifactId: artifactId,
          summary: 'All 5 tasks completed successfully.',
        },
      });

      this.isCompleted = true;
    } else {
      await this.options.approvalRepo.updateStatus(approvalId, 'rejected', 'Rejected by human operator');

      await this.options.eventBus.publish({
        eventId: generateId('evt'),
        taskId: task.id,
        type: 'node_failed',
        timestamp: getTimestamp(),
        actorType: 'system',
        actorId: 'system',
        correlationId: generateId('corr'),
        payload: {
          nodeId: n5,
          error: 'Approval rejected by operator.',
        },
      });
    }

    return task;
  }
}
