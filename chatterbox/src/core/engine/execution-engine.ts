import { TaskRepository } from '../storage/repositories/task.repository.js';
import { TaskNodeRepository } from '../storage/repositories/task-node.repository.js';
import { UsageRepository } from '../storage/repositories/usage.repository.js';
import { ArtifactService } from '../artifacts/artifact.service.js';
import { EventBus } from '../events/event-bus.js';
import { LlmProvider } from '../llm/types.js';
import { AgentRegistry } from '../agents/runtime/agent-registry.js';
import { createDefaultAgentRegistry } from '../agents/specialists/index.js';
import { ToolRegistry } from '../tools/tool.interface.js';
import { createDefaultToolRegistry } from '../tools/index.js';
import { Scheduler, SchedulerResult } from './scheduler.js';
import { RetryPolicy } from './retry-policy.js';
import { LocalSandboxService } from '../security/sandbox/local-sandbox.service.js';
import { PermissionService } from '../security/permissions/types.js';
import { ApprovalEngine } from '../security/approvals/approval-engine.js';
import { CrashRecoveryService } from '../security/recovery/crash-recovery.service.js';
import { generateId } from '../../utils/ids.js';
import { getTimestamp } from '../../utils/time.js';

export interface ExecutionEngineOptions {
  taskRepo: TaskRepository;
  taskNodeRepo: TaskNodeRepository;
  artifactService: ArtifactService;
  eventBus: EventBus;
  llmProvider: LlmProvider;
  usageRepo?: UsageRepository;
  agentRegistry?: AgentRegistry;
  toolRegistry?: ToolRegistry;
  retryPolicy?: RetryPolicy;
  sandbox?: LocalSandboxService;
  permissionService?: PermissionService;
  approvalEngine?: ApprovalEngine;
  crashRecoveryService?: CrashRecoveryService;
}

export interface RunExecutionOptions {
  concurrency?: number;
  fast?: boolean;
  signal?: AbortSignal;
  maxInputTokens?: number;
  noStream?: boolean;
  model?: string;
  initialUserInstructions?: Record<string, string[]>;
  workspaceRoot?: string;
  mode?: 'read-only' | 'workspace-write' | 'supervised';
}

export class ExecutionEngine {
  private activeScheduler: Scheduler | null = null;
  private readonly agentRegistry: AgentRegistry;
  private readonly toolRegistry: ToolRegistry;
  private readonly sandbox?: LocalSandboxService;
  private readonly permissionService?: PermissionService;
  private readonly approvalEngine?: ApprovalEngine;
  private readonly crashRecoveryService?: CrashRecoveryService;

  constructor(private readonly options: ExecutionEngineOptions) {
    this.agentRegistry = options.agentRegistry || createDefaultAgentRegistry();
    this.toolRegistry = options.toolRegistry || createDefaultToolRegistry();
    this.sandbox = options.sandbox;
    this.permissionService = options.permissionService;
    this.approvalEngine = options.approvalEngine;
    this.crashRecoveryService = options.crashRecoveryService;
  }

  get currentScheduler(): Scheduler | null {
    return this.activeScheduler;
  }

  pause(): void {
    if (this.activeScheduler) {
      this.activeScheduler.pause();
    }
  }

  resume(): void {
    if (this.activeScheduler) {
      this.activeScheduler.resume();
    }
  }

  async addInstruction(agentRole: string, instruction: string, target?: string): Promise<void> {
    if (this.activeScheduler) {
      await this.activeScheduler.addInstruction(agentRole, instruction, target);
    }
  }

  async runTask(taskId: string, runOptions: RunExecutionOptions = {}): Promise<SchedulerResult> {
    const task = await this.options.taskRepo.getById(taskId);
    if (!task) {
      throw new Error(`Task with ID "${taskId}" not found.`);
    }

    const nodes = await this.options.taskNodeRepo.listByTaskId(taskId);
    if (nodes.length === 0) {
      throw new Error(`Task "${taskId}" has no task nodes to execute.`);
    }

    const scheduler = new Scheduler({
      taskId,
      goal: task.goal,
      taskTitle: task.title,
      nodes,
      agentRegistry: this.agentRegistry,
      toolRegistry: this.toolRegistry,
      artifactService: this.options.artifactService,
      eventBus: this.options.eventBus,
      taskRepo: this.options.taskRepo,
      taskNodeRepo: this.options.taskNodeRepo,
      usageRepo: this.options.usageRepo,
      llmProvider: this.options.llmProvider,
      concurrency: runOptions.concurrency ?? 3,
      fast: runOptions.fast ?? false,
      signal: runOptions.signal,
      retryPolicy: this.options.retryPolicy,
      maxInputTokens: runOptions.maxInputTokens,
      noStream: runOptions.noStream,
      model: runOptions.model,
      sandbox: this.sandbox,
      permissionService: this.permissionService,
      approvalEngine: this.approvalEngine,
      crashRecoveryService: this.crashRecoveryService,
      initialUserInstructions: runOptions.initialUserInstructions,
      workspaceRoot: runOptions.workspaceRoot ?? task.workspace,
      mode: runOptions.mode,
    });

    this.activeScheduler = scheduler;

    try {
      return await scheduler.execute();
    } finally {
      if (this.activeScheduler === scheduler) {
        this.activeScheduler = null;
      }
    }
  }

  async resumeTask(taskId: string, runOptions: RunExecutionOptions = {}): Promise<SchedulerResult> {
    const task = await this.options.taskRepo.getById(taskId);
    if (!task) {
      throw new Error(`Task with ID "${taskId}" not found.`);
    }

    const rawNodes = await this.options.taskNodeRepo.listByTaskId(taskId);
    if (rawNodes.length === 0) {
      throw new Error(`Task "${taskId}" has no task nodes to resume.`);
    }

    if (this.crashRecoveryService) {
      await this.crashRecoveryService.recoverTask(taskId, 'mock');
    } else {
      // Reset any interrupted 'running' nodes back to 'pending' so they can cleanly run
      await Promise.all(
        rawNodes.map(async (n) => {
          if (n.status === 'running') {
            await this.options.taskNodeRepo.updateStatus(n.id, 'pending');
          }
        })
      );

      await this.options.eventBus.publish({
        eventId: generateId('evt'),
        taskId,
        type: 'task_resumed',
        timestamp: getTimestamp(),
        actorType: 'user',
        actorId: 'operator',
        correlationId: generateId('corr'),
        payload: { reason: `Resuming execution for task "${taskId}"` },
      });
    }

    return await this.runTask(taskId, runOptions);
  }
}
