import { TaskNode } from '../models/task-node.js';
import { TaskNodeStatus } from '../models/enums.js';
import { Artifact } from '../models/artifact.js';
import { AgentRegistry } from '../agents/runtime/agent-registry.js';
import { AgentRunContext } from '../agents/runtime/types.js';
import { ToolRegistry } from '../tools/tool.interface.js';
import { ArtifactService } from '../artifacts/artifact.service.js';
import { EventBus } from '../events/event-bus.js';
import { TaskRepository } from '../storage/repositories/task.repository.js';
import { TaskNodeRepository } from '../storage/repositories/task-node.repository.js';
import { UsageRepository } from '../storage/repositories/usage.repository.js';
import { LlmProvider, LlmUsage } from '../llm/types.js';
import { RetryPolicy } from './retry-policy.js';
import { LocalSandboxService, BudgetExceededError } from '../security/sandbox/local-sandbox.service.js';
import { PermissionService } from '../security/permissions/types.js';
import { ApprovalEngine } from '../security/approvals/approval-engine.js';
import { CrashRecoveryService } from '../security/recovery/crash-recovery.service.js';
import { QualityGateService } from '../security/quality-gates.js';
import { AgentFeedEvent } from '../events/event-types.js';
import { generateId } from '../../utils/ids.js';
import { getTimestamp } from '../../utils/time.js';
import { sanitizeErrorMessage } from '../../utils/security.js';

export interface SchedulerOptions {
  taskId: string;
  goal: string;
  taskTitle: string;
  nodes: TaskNode[];
  agentRegistry: AgentRegistry;
  toolRegistry: ToolRegistry;
  artifactService: ArtifactService;
  eventBus: EventBus;
  taskRepo: TaskRepository;
  taskNodeRepo: TaskNodeRepository;
  usageRepo?: UsageRepository;
  llmProvider: LlmProvider;
  concurrency?: number;
  fast?: boolean;
  signal?: AbortSignal;
  retryPolicy?: RetryPolicy;
  maxInputTokens?: number;
  noStream?: boolean;
  model?: string;
  sandbox?: LocalSandboxService;
  permissionService?: PermissionService;
  approvalEngine?: ApprovalEngine;
  crashRecoveryService?: CrashRecoveryService;
  initialUserInstructions?: Record<string, string[]>;
  workspaceRoot?: string;
  mode?: 'read-only' | 'workspace-write' | 'supervised';
}

export interface SchedulerResult {
  taskId: string;
  taskStatus: 'done' | 'failed' | 'blocked' | 'cancelled' | 'review';
  nodesCompleted: number;
  nodesFailed: number;
  nodesBlocked: number;
  totalNodes: number;
  finalArtifact?: Artifact | null;
  totalUsage: LlmUsage;
  durationMs: number;
  error?: string;
}

export class Scheduler {
  private readonly taskId: string;
  private readonly goal: string;
  private readonly taskTitle: string;
  private readonly nodes: Map<string, TaskNode> = new Map();
  private readonly nodeStatuses: Map<string, TaskNodeStatus> = new Map();
  private readonly nodeArtifacts: Map<string, string[]> = new Map();
  private readonly runningPromises: Map<string, Promise<void>> = new Map();

  private readonly agentRegistry: AgentRegistry;
  private readonly toolRegistry: ToolRegistry;
  private readonly artifactService: ArtifactService;
  private readonly eventBus: EventBus;
  private readonly taskRepo: TaskRepository;
  private readonly taskNodeRepo: TaskNodeRepository;
  private readonly usageRepo?: UsageRepository;
  private readonly llmProvider: LlmProvider;
  private readonly retryPolicy: RetryPolicy;
  private readonly concurrency: number;
  private readonly fast: boolean;
  private readonly signal?: AbortSignal;
  private readonly maxInputTokens?: number;
  private readonly noStream?: boolean;
  private readonly model?: string;
  private readonly sandbox?: LocalSandboxService;
  private readonly permissionService?: PermissionService;
  private readonly approvalEngine?: ApprovalEngine;
  private readonly crashRecoveryService?: CrashRecoveryService;
  private readonly workspaceRoot?: string;
  private readonly mode?: 'read-only' | 'workspace-write' | 'supervised';
  private readonly userInstructionsByRole = new Map<string, string[]>();
  private readonly recordedEvents: AgentFeedEvent[] = [];

  private isPaused = false;
  private pauseWaiters: Array<() => void> = [];
  private isAborted = false;
  private totalUsage: LlmUsage = { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 };

  constructor(options: SchedulerOptions) {
    this.taskId = options.taskId;
    this.goal = options.goal;
    this.taskTitle = options.taskTitle;
    this.agentRegistry = options.agentRegistry;
    this.toolRegistry = options.toolRegistry;
    this.artifactService = options.artifactService;
    this.eventBus = options.eventBus;
    this.taskRepo = options.taskRepo;
    this.taskNodeRepo = options.taskNodeRepo;
    this.usageRepo = options.usageRepo;
    this.llmProvider = options.llmProvider;
    this.concurrency = Math.max(1, options.concurrency ?? 3);
    this.fast = Boolean(options.fast);
    this.signal = options.signal;
    this.retryPolicy = options.retryPolicy || new RetryPolicy({ fast: this.fast });
    this.maxInputTokens = options.maxInputTokens;
    this.noStream = options.noStream;
    this.model = options.model;
    this.sandbox = options.sandbox;
    this.permissionService = options.permissionService;
    this.approvalEngine = options.approvalEngine;
    this.crashRecoveryService = options.crashRecoveryService;
    this.workspaceRoot = options.workspaceRoot;
    this.mode = options.mode;

    this.eventBus.subscribe('*', (evt: AgentFeedEvent) => {
      if (evt.taskId === this.taskId) {
        this.recordedEvents.push(evt);
      }
    });

    if (options.initialUserInstructions) {
      for (const [role, instructions] of Object.entries(options.initialUserInstructions)) {
        this.userInstructionsByRole.set(role, [...instructions]);
      }
    }

    for (const node of options.nodes) {
      this.nodes.set(node.id, { ...node });
      this.nodeStatuses.set(node.id, node.status);
      if (node.outputArtifactId) {
        this.nodeArtifacts.set(node.id, [node.outputArtifactId]);
      }
    }

    if (this.signal) {
      this.signal.addEventListener('abort', () => {
        this.isAborted = true;
        this.wakePauseWaiters();
      });
    }
  }

  async addInstruction(agentRole: string, instruction: string, target?: string): Promise<void> {
    const current = this.userInstructionsByRole.get(agentRole) || [];
    current.push(instruction);
    this.userInstructionsByRole.set(agentRole, current);

    await this.eventBus.publish({
      eventId: generateId('evt'),
      taskId: this.taskId,
      type: 'user_instruction',
      timestamp: getTimestamp(),
      actorType: 'user',
      actorId: 'operator',
      correlationId: generateId('corr'),
      payload: {
        agentRole,
        instruction,
        target,
      },
    });
  }

  pause(): void {
    if (this.isPaused || this.isAborted) return;
    this.isPaused = true;
    void this.eventBus.publish({
      eventId: generateId('evt'),
      taskId: this.taskId,
      type: 'task_paused',
      timestamp: getTimestamp(),
      actorType: 'user',
      actorId: 'operator',
      correlationId: generateId('corr'),
      payload: { reason: 'Execution paused by operator' },
    });
  }

  resume(): void {
    if (!this.isPaused || this.isAborted) return;
    this.isPaused = false;
    void this.eventBus.publish({
      eventId: generateId('evt'),
      taskId: this.taskId,
      type: 'task_resumed',
      timestamp: getTimestamp(),
      actorType: 'user',
      actorId: 'operator',
      correlationId: generateId('corr'),
      payload: { reason: 'Execution resumed by operator' },
    });
    this.wakePauseWaiters();
  }

  private wakePauseWaiters(): void {
    const waiters = this.pauseWaiters;
    this.pauseWaiters = [];
    for (const w of waiters) w();
  }

  private async checkPause(): Promise<void> {
    while (this.isPaused && !this.isAborted && !this.signal?.aborted) {
      await new Promise<void>((resolve) => {
        this.pauseWaiters.push(resolve);
      });
    }
  }

  async execute(): Promise<SchedulerResult> {
    const startTime = Date.now();

    // 1. Transition task to running
    await this.taskRepo.updateStatus(this.taskId, 'running');
    await this.eventBus.publish({
      eventId: generateId('evt'),
      taskId: this.taskId,
      type: 'task_updated',
      timestamp: getTimestamp(),
      actorType: 'system',
      actorId: 'system',
      correlationId: generateId('corr'),
      payload: {
        status: 'running',
        patch: { status: 'running' },
      },
    });

    // 2. Pre-load existing artifacts for completed nodes
    const existingArtifacts = await this.artifactService.listArtifacts(this.taskId);
    for (const art of existingArtifacts) {
      if (art.nodeId) {
        const current = this.nodeArtifacts.get(art.nodeId) || [];
        if (!current.includes(art.id)) {
          current.push(art.id);
          this.nodeArtifacts.set(art.nodeId, current);
        }
      }
    }

    // 3. Main execution loop until graph reaches quiescence
    while (!this.isAborted && !this.signal?.aborted) {
      await this.checkPause();

      // Evaluate dependencies and cascade blocks
      this.evaluateDependencyBlocks();

      // Find nodes that are ready to run
      const readyNodes = this.getReadyNodes();

      if (readyNodes.length === 0 && this.runningPromises.size === 0) {
        // No active or runnable nodes left; schedule done
        break;
      }

      // Schedule as many ready nodes as concurrency limit allows
      const availableSlots = this.concurrency - this.runningPromises.size;
      const nodesToLaunch = readyNodes.slice(0, Math.max(0, availableSlots));

      for (const node of nodesToLaunch) {
        const promise = this.executeNode(node)
          .catch(() => {
            // Error handling is handled within executeNode
          })
          .finally(() => {
            this.runningPromises.delete(node.id);
          });

        this.runningPromises.set(node.id, promise);
      }

      if (this.runningPromises.size > 0) {
        // Wait for at least one running node to finish before evaluating next step
        await Promise.race(Array.from(this.runningPromises.values()));
      } else {
        // Nothing running and no ready nodes
        break;
      }
    }

    // If aborted, clean up remaining promises
    if (this.signal?.aborted || this.isAborted) {
      await Promise.allSettled(Array.from(this.runningPromises.values()));
    }

    const durationMs = Date.now() - startTime;
    return await this.finalizeTask(durationMs);
  }

  private evaluateDependencyBlocks(): void {
    let changed = true;
    while (changed) {
      changed = false;
      for (const [nodeId, status] of this.nodeStatuses.entries()) {
        if (status === 'pending') {
          const node = this.nodes.get(nodeId);
          if (!node) continue;

          for (const depId of node.dependsOn) {
            const depStatus = this.nodeStatuses.get(depId);
            if (depStatus === 'failed' || depStatus === 'blocked') {
              this.nodeStatuses.set(nodeId, 'blocked');
              void this.taskNodeRepo.updateStatus(nodeId, 'blocked');
              void this.eventBus.publish({
                eventId: generateId('evt'),
                taskId: this.taskId,
                nodeId,
                type: 'error_occurred',
                timestamp: getTimestamp(),
                actorType: 'system',
                actorId: 'system',
                correlationId: generateId('corr'),
                payload: {
                  nodeId,
                  error: `Node "${node.title}" is blocked because dependency "${depId}" is ${depStatus}.`,
                  fatal: false,
                },
              });
              changed = true;
              break;
            }
          }
        }
      }
    }
  }

  private getReadyNodes(): TaskNode[] {
    const ready: TaskNode[] = [];
    for (const [nodeId, status] of this.nodeStatuses.entries()) {
      if (status === 'pending') {
        const node = this.nodes.get(nodeId);
        if (!node) continue;

        // Check all dependencies are 'done'
        const allDepsDone = node.dependsOn.every((depId) => this.nodeStatuses.get(depId) === 'done');
        if (allDepsDone) {
          ready.push(node);
        }
      }
    }
    return ready;
  }

  private async executeNode(node: TaskNode): Promise<void> {
    const nodeId = node.id;
    this.nodeStatuses.set(nodeId, 'running');
    await this.taskNodeRepo.updateStatus(nodeId, 'running');

    if (this.sandbox) {
      try {
        this.sandbox.recordStep(this.taskId);
      } catch (err) {
        if (err instanceof BudgetExceededError) {
          const errorMsg = sanitizeErrorMessage(err);
          this.isAborted = true;
          this.nodeStatuses.set(nodeId, 'failed');
          await this.taskNodeRepo.updateStatus(nodeId, 'failed');
          await this.eventBus.publish({
            eventId: generateId('evt'),
            taskId: this.taskId,
            nodeId,
            type: 'error_occurred',
            timestamp: getTimestamp(),
            actorType: 'system',
            actorId: 'sandbox',
            correlationId: generateId('corr'),
            payload: {
              nodeId,
              error: errorMsg,
              fatal: true,
            },
          });
          return;
        }
      }
    }

    // Gather input artifacts from dependencies
    const inputArtifacts: Artifact[] = [];
    for (const depId of node.dependsOn) {
      const artIds = this.nodeArtifacts.get(depId) || [];
      for (const artId of artIds) {
        const art = await this.artifactService.getArtifact(artId);
        if (art) inputArtifacts.push(art);
      }
    }

    const runner = this.agentRegistry.get(node.assignedAgentRole);

    const roleInstructions = this.userInstructionsByRole.get(node.assignedAgentRole) || [];
    const globalInstructions = this.userInstructionsByRole.get('all') || [];
    const combinedInstructions = [...globalInstructions, ...roleInstructions];

    const context: AgentRunContext = {
      taskId: this.taskId,
      nodeId,
      goal: this.goal,
      taskTitle: this.taskTitle,
      node,
      inputArtifacts,
      dependencies: node.dependsOn.map((depId) => this.nodes.get(depId)!).filter(Boolean),
      signal: this.signal || new AbortController().signal,
      llmProvider: this.llmProvider,
      toolRegistry: this.toolRegistry,
      eventBus: this.eventBus,
      artifactService: this.artifactService,
      fast: this.fast,
      maxInputTokens: this.maxInputTokens,
      noStream: this.noStream,
      model: this.model,
      userInstructions: combinedInstructions,
      workspaceRoot: this.workspaceRoot,
      mode: this.mode,
    };

    try {
      const result = await this.retryPolicy.executeWithRetry({
        taskId: this.taskId,
        nodeId,
        actorId: `agent_${runner.role}`,
        eventBus: this.eventBus,
        signal: this.signal,
        operation: async () => {
          return await runner.run(context);
        },
      });

      // Accumulate usage
      this.totalUsage.inputTokens += result.usage.inputTokens;
      this.totalUsage.outputTokens += result.usage.outputTokens;
      if (result.usage.estimatedCostUsd) {
        this.totalUsage.estimatedCostUsd =
          (this.totalUsage.estimatedCostUsd || 0) + result.usage.estimatedCostUsd;
      }

      if (this.sandbox && (result.usage.inputTokens > 0 || result.usage.outputTokens > 0)) {
        try {
          this.sandbox.recordLlmCall(this.taskId, result.usage.inputTokens + result.usage.outputTokens);
        } catch (err) {
          if (err instanceof BudgetExceededError) {
            this.isAborted = true;
            await this.eventBus.publish({
              eventId: generateId('evt'),
              taskId: this.taskId,
              nodeId,
              type: 'error_occurred',
              timestamp: getTimestamp(),
              actorType: 'system',
              actorId: 'sandbox',
              correlationId: generateId('corr'),
              payload: {
                nodeId,
                error: sanitizeErrorMessage(err),
                fatal: true,
              },
            });
          }
        }
      }

      // Persist usage to database if usageRepo is configured
      if (this.usageRepo && (result.usage.inputTokens > 0 || result.usage.outputTokens > 0)) {
        try {
          await this.usageRepo.create({
            id: generateId('use'),
            taskId: this.taskId,
            agentId: `agent_${node.assignedAgentRole}`,
            model: this.model || 'gpt-4o',
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            estimatedCost: result.usage.estimatedCostUsd ?? 0,
            toolCalls: 1,
            createdAt: getTimestamp(),
          });
        } catch {
          // Non-fatal if storage fails
        }
      }

      if (result.status === 'done') {
        this.nodeStatuses.set(nodeId, 'done');
        await this.taskNodeRepo.updateStatus(nodeId, 'done');

        if (result.outputArtifactIds.length > 0) {
          const primaryArtifactId = result.outputArtifactIds[0];
          await this.taskNodeRepo.updateOutputArtifactId(nodeId, primaryArtifactId);
          this.nodeArtifacts.set(nodeId, result.outputArtifactIds);
        }

        if (this.crashRecoveryService) {
          const completedNodeIds: string[] = [];
          const pendingNodeIds: string[] = [];
          for (const [id, s] of this.nodeStatuses.entries()) {
            if (s === 'done') completedNodeIds.push(id);
            else if (s === 'pending') pendingNodeIds.push(id);
          }
          void this.crashRecoveryService.saveCheckpoint(this.taskId, {
            completedNodeIds,
            pendingNodeIds,
          });
        }
      } else {
        const failureStatus = result.status === 'blocked' ? 'blocked' : 'failed';
        this.nodeStatuses.set(nodeId, failureStatus);
        await this.taskNodeRepo.updateStatus(nodeId, failureStatus);
      }
    } catch (err: unknown) {
      const errorMsg = sanitizeErrorMessage(err);
      if (err instanceof BudgetExceededError) {
        this.isAborted = true;
        await this.eventBus.publish({
          eventId: generateId('evt'),
          taskId: this.taskId,
          nodeId,
          type: 'error_occurred',
          timestamp: getTimestamp(),
          actorType: 'system',
          actorId: 'sandbox',
          correlationId: generateId('corr'),
          payload: {
            nodeId,
            error: errorMsg,
            fatal: true,
          },
        });
      }

      this.nodeStatuses.set(nodeId, 'failed');
      await this.taskNodeRepo.updateStatus(nodeId, 'failed');

      // Emit node_failed if not already done
      await this.eventBus.publish({
        eventId: generateId('evt'),
        taskId: this.taskId,
        nodeId,
        type: 'node_failed',
        timestamp: getTimestamp(),
        actorType: 'system',
        actorId: 'system',
        correlationId: generateId('corr'),
        payload: {
          nodeId,
          error: errorMsg,
        },
      });
    }
  }

  private async finalizeTask(durationMs: number): Promise<SchedulerResult> {
    let completedCount = 0;
    let failedCount = 0;
    let blockedCount = 0;

    for (const status of this.nodeStatuses.values()) {
      if (status === 'done') completedCount++;
      else if (status === 'failed') failedCount++;
      else if (status === 'blocked') blockedCount++;
    }

    const totalNodes = this.nodes.size;
    let taskStatus: 'done' | 'failed' | 'blocked' | 'cancelled' | 'review';

    // Locate latest / final deliverable artifact
    const allArtifacts = await this.artifactService.listArtifacts(this.taskId);
    const deliverable =
      allArtifacts.find((a) => a.path.endsWith('change-summary.md')) ||
      allArtifacts.find((a) => a.path.endsWith('competitive-brief.md')) ||
      allArtifacts[0] ||
      null;

    const isCodingTask = Array.from(this.nodes.values()).some(
      (n) => n.assignedAgentRole === 'coder' || n.assignedAgentRole === 'explorer'
    );

    if (this.signal?.aborted || this.isAborted) {
      taskStatus = 'cancelled';
      await this.taskRepo.updateStatus(this.taskId, 'cancelled');
    } else if (completedCount === totalNodes) {
      if (isCodingTask) {
        const qg = await QualityGateService.evaluate({
          taskId: this.taskId,
          workspaceRoot: this.workspaceRoot || process.cwd(),
          events: this.recordedEvents,
          artifactPaths: allArtifacts.map((a) => a.path),
          eventBus: this.eventBus,
        });

        if (!qg.passed) {
          taskStatus = qg.suggestedStatus || 'review';
          await this.taskRepo.updateStatus(this.taskId, taskStatus);
          await this.eventBus.publish({
            eventId: generateId('evt'),
            taskId: this.taskId,
            type: 'task_updated',
            timestamp: getTimestamp(),
            actorType: 'system',
            actorId: 'system',
            correlationId: generateId('corr'),
            payload: {
              status: taskStatus,
              patch: { status: taskStatus },
              reasons: qg.reasons,
              actionableNextSteps: qg.actionableNextSteps,
            },
          });
          return {
            taskId: this.taskId,
            taskStatus,
            nodesCompleted: completedCount,
            nodesFailed: failedCount,
            nodesBlocked: blockedCount,
            totalNodes,
            finalArtifact: deliverable,
            totalUsage: this.totalUsage,
            durationMs,
            error: `Quality gates failed: ${qg.reasons.join('; ')}. Next steps: ${qg.actionableNextSteps.join(' ')}`,
          };
        }
      }

      taskStatus = 'done';
      await this.taskRepo.updateStatus(this.taskId, 'done');

      // If change-summary deliverable, emit change_summary_created
      if (deliverable && deliverable.path.endsWith('change-summary.md')) {
        await this.eventBus.publish({
          eventId: generateId('evt'),
          taskId: this.taskId,
          type: 'change_summary_created',
          timestamp: getTimestamp(),
          actorType: 'system',
          actorId: 'scheduler',
          correlationId: generateId('corr'),
          payload: {
            artifactId: deliverable.id,
            path: deliverable.path,
            filesChangedCount: 1,
            filesCreatedCount: 1,
            testsPassed: true,
          },
        });
      }

      // Publish task_completed
      await this.eventBus.publish({
        eventId: generateId('evt'),
        taskId: this.taskId,
        type: 'task_completed',
        timestamp: getTimestamp(),
        actorType: 'system',
        actorId: 'system',
        correlationId: generateId('corr'),
        payload: {
          deliverableArtifactId: deliverable?.id,
          summary: `All ${totalNodes} task nodes completed successfully in ${Math.round(durationMs / 1000)}s.`,
        },
      });
    } else if (failedCount > 0 && !deliverable) {
      taskStatus = 'failed';
      await this.taskRepo.updateStatus(this.taskId, 'failed');
    } else {
      taskStatus = 'blocked';
      await this.taskRepo.updateStatus(this.taskId, 'blocked');
    }

    await this.eventBus.publish({
      eventId: generateId('evt'),
      taskId: this.taskId,
      type: 'task_updated',
      timestamp: getTimestamp(),
      actorType: 'system',
      actorId: 'system',
      correlationId: generateId('corr'),
      payload: {
        status: taskStatus,
        patch: { status: taskStatus },
      },
    });

    return {
      taskId: this.taskId,
      taskStatus,
      nodesCompleted: completedCount,
      nodesFailed: failedCount,
      nodesBlocked: blockedCount,
      totalNodes,
      finalArtifact: deliverable,
      totalUsage: this.totalUsage,
      durationMs,
    };
  }
}
