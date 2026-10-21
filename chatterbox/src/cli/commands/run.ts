import { Command } from 'commander';
import { join } from 'path';
import React from 'react';
import { render } from 'ink';
import { loadConfig, resolveStorageDir } from '../../core/config/config.js';
import { getDatabase } from '../../core/storage/database.js';
import { TaskRepository } from '../../core/storage/repositories/task.repository.js';
import { TaskNodeRepository } from '../../core/storage/repositories/task-node.repository.js';
import { ArtifactRepository } from '../../core/storage/repositories/artifact.repository.js';
import { UsageRepository } from '../../core/storage/repositories/usage.repository.js';
import { ApprovalRepository } from '../../core/storage/repositories/approval.repository.js';
import { ChangesetRepository } from '../../core/storage/repositories/changeset.repository.js';
import { changesetService } from '../../core/workspace/changeset.service.js';
import { EventStore } from '../../core/events/event-store.js';

import { EventBus } from '../../core/events/event-bus.js';
import { ArtifactService } from '../../core/artifacts/artifact.service.js';
import { ExecutionEngine } from '../../core/engine/execution-engine.js';
import { createLlmProvider } from '../../core/llm/index.js';
import { createSpecialistAgentRegistry } from '../../core/agents/specialists/index.js';
import { createDefaultToolRegistry } from '../../core/tools/index.js';
import { DefaultToolRegistry } from '../../core/tools/tool-registry.js';
import { DefaultPermissionService } from '../../core/security/permissions/permission.service.js';
import { ApprovalEngine } from '../../core/security/approvals/approval-engine.js';
import { LocalSandboxService } from '../../core/security/sandbox/local-sandbox.service.js';
import { CrashRecoveryService } from '../../core/security/recovery/crash-recovery.service.js';
import { PlannerAgent } from '../../core/agents/planner/planner.agent.js';
import { ProposedPlan } from '../../core/agents/planner/planner.schema.js';
import { TaskNode } from '../../core/models/task-node.js';
import { AgentRole } from '../../core/models/enums.js';
import { generateId } from '../../utils/ids.js';
import { getTimestamp } from '../../utils/time.js';
import { logger } from '../../utils/logger.js';
import { redactSensitiveText, sanitizeErrorMessage } from '../../utils/security.js';
import { App, AppController } from '../../tui/App.js';
import { ProposedPlanTaskState } from '../../tui/hooks/useAgentFeedEvents.js';

import { workspaceService, WorkspaceMode } from '../../core/workspace/workspace.service.js';
import { gitService } from '../../core/workspace/git.service.js';
import { defaultWorkflowRegistry } from '../../core/workflows/workflow-registry.js';
import { symbols } from '../../tui/design/symbols.js';

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

interface RunCommandOptions {
  workspace?: string;
  mode?: WorkspaceMode;
  workflow?: string;
  mock?: boolean;
  fast?: boolean;
  concurrency?: string;
  planOnly?: boolean;
  title?: string;
  visibility?: 'public' | 'private';
  maxTasks?: number;
  provider?: 'mock' | 'openai-compatible';
  model?: string;
  baseUrl?: string;
  tui: boolean;
  approve?: boolean;
  reject?: boolean;
  revise?: string;
  stream?: boolean;
  maxInputTokens?: number;
  maxSteps?: number;
  maxLlmCalls?: number;
  maxTokens?: number;
  maxDurationMinutes?: number;
  autoApproveLowRisk?: boolean;
}

export const runCommand = new Command('run')
  .description('Run Chatterbox / AgentFeed to plan and execute a goal')
  .argument('<goal>', 'The goal for the agent team to plan and accomplish')
  .option('--workspace <path>', 'Workspace directory boundary (default: current working directory)')
  .option('--mode <mode>', 'Workspace execution mode: read-only, workspace-write, or supervised (default: supervised)', 'supervised')
  .option('--workflow <workflowId>', 'Workflow template to run (e.g. coding-task, competitive-brief)')
  .option('--mock', 'Force the deterministic mock specialist agent runtime and planner provider')
  .option('--fast', 'Reduce simulation delays for rapid execution', false)
  .option('--concurrency <n>', 'Maximum concurrent specialist agent nodes (default: 3)', '3')
  .option('--plan-only', 'Stop after plan proposal and approval without executing task graph', false)
  .option('--title <title>', 'Custom title for the task')
  .option('--visibility <visibility>', 'Task visibility (public or private)', 'public')
  .option('--max-tasks <n>', 'Maximum number of tasks to generate', (val) => parseInt(val, 10))
  .option('--provider <provider>', 'LLM provider override (mock or openai-compatible)')
  .option('--model <model>', 'LLM model override')
  .option('--base-url <url>', 'LLM base URL override')
  .option('--no-tui', 'Run in headless non-interactive mode')
  .option('--no-stream', 'Force non-streaming completion for LLM calls')
  .option('--max-input-tokens <n>', 'Maximum input token budget for agent context', (val) => parseInt(val, 10))
  .option('--max-steps <n>', 'Maximum agent steps budget (default: 50)', (val) => parseInt(val, 10), 50)
  .option('--max-llm-calls <n>', 'Maximum LLM calls budget (default: 40)', (val) => parseInt(val, 10), 40)
  .option('--max-tokens <n>', 'Maximum token usage budget (default: 500000)', (val) => parseInt(val, 10), 500000)
  .option('--max-duration-minutes <n>', 'Maximum elapsed time budget in minutes (default: 10)', (val) => parseInt(val, 10), 10)
  .option('--auto-approve-low-risk', 'Automatically approve explicitly low-risk actions only', false)
  .option('--approve', 'Automatically approve the proposed plan and begin execution')
  .option('--reject', 'Automatically reject the proposed plan')
  .option('--revise <feedback>', 'Automatically request plan revision with specified feedback')
  .action(async (goal: string, options: RunCommandOptions) => {
    const config = loadConfig();
    const baseDir = resolveStorageDir();
    const dbPath = join(baseDir, 'local.db');
    const db = getDatabase(dbPath);

    const taskRepo = new TaskRepository(db);
    const taskNodeRepo = new TaskNodeRepository(db);
    const artifactRepo = new ArtifactRepository(db);
    const usageRepo = new UsageRepository(db);
    const approvalRepo = new ApprovalRepository(db);
    const eventStore = new EventStore(baseDir);
    const eventBus = new EventBus(eventStore);
    const artifactService = new ArtifactService(baseDir, artifactRepo, eventBus);

    // Prepare LLM provider
    const llmConfig = { ...config.llm };
    if (options.provider) llmConfig.provider = options.provider;
    if (options.model) llmConfig.model = options.model;
    if (options.baseUrl) llmConfig.baseUrl = options.baseUrl;

    const forceMock = Boolean(options.mock || llmConfig.provider === 'mock');
    const apiKeyVar = llmConfig.apiKeyEnvVar || 'OPENAI_API_KEY';

    if (!forceMock && llmConfig.provider === 'openai-compatible' && (!process.env[apiKeyVar] || process.env[apiKeyVar]?.trim().length === 0)) {
      const banner = symbols.logo.getCompactHeader('v0.1.0');
      logger.info(`\n\x1b[33m${banner}\x1b[0m`);
      logger.info(bold(red(`Configuration Error: Missing API Key (${apiKeyVar})\n`)));
      logger.info(`Real LLM mode requires an API key in the ${bold(apiKeyVar)} environment variable.`);
      logger.info(`\nTo run in real BYOK mode with your LLM provider:`);
      logger.info(`  ${cyan(`export ${apiKeyVar}="sk-..."`)}`);
      logger.info(`  ${cyan(`agentfeed run "${goal}" --workspace ./my-project`)}`);
      logger.info(`\nTo run offline in deterministic mock mode without an API key:`);
      logger.info(`  ${cyan(`agentfeed run "${goal}" --workspace ./my-project --mock --fast`)}\n`);
      process.exit(1);
    }

    let provider;
    try {
      provider = createLlmProvider(llmConfig, forceMock);
    } catch (err) {
      const sanitized = redactSensitiveText((err as Error).message);
      logger.error(`Failed to initialize LLM provider: ${sanitized}`);
      process.exit(1);
    }

    // Resolve and canonicalize workspace boundary at startup
    let resolvedWorkspace;
    try {
      resolvedWorkspace = await workspaceService.resolve({
        workspace: options.workspace,
        mode: options.mode,
      });
    } catch (err: unknown) {
      logger.error(sanitizeErrorMessage(err));
      process.exit(1);
    }

    const gitInfo = gitService.probeGit(resolvedWorkspace.absoluteRoot);

    // Create Task record
    const taskId = generateId('task');
    const taskTitle = options.title || (goal.length > 60 ? `${goal.slice(0, 57)}...` : goal);
    const correlationId = generateId('corr');
    const concurrencyNum = parseInt(options.concurrency || '3', 10) || 3;

    const permissionService = new DefaultPermissionService({ eventBus });
    const changesetRepo = new ChangesetRepository(db);
    changesetService.setRepository(changesetRepo);
    changesetService.setEventBus(eventBus);
    changesetService.setWorkspaceRoot(resolvedWorkspace.absoluteRoot);

    const approvalEngine = new ApprovalEngine({

      approvalRepo,
      eventBus,
      autoApproveLowRisk: Boolean(options.autoApproveLowRisk),
      mode: resolvedWorkspace.mode,
    });
    const sandbox = new LocalSandboxService(baseDir);
    sandbox.configureBudget(taskId, {
      maxAgentSteps: options.maxSteps ?? 50,
      maxLlmCalls: options.maxLlmCalls ?? 40,
      maxTotalTokens: options.maxTokens ?? 500000,
      maxElapsedMs: (options.maxDurationMinutes ?? 10) * 60 * 1000,
    });
    artifactService.setSandbox(sandbox);

    const crashRecoveryService = new CrashRecoveryService({
      taskRepo,
      taskNodeRepo,
      artifactRepo,
      eventBus,
    });

    const toolRegistry = createDefaultToolRegistry();
    if ('setSecurityServices' in toolRegistry) {
      (toolRegistry as DefaultToolRegistry).setSecurityServices(permissionService, approvalEngine);
    }

    let task;
    try {
      task = await taskRepo.create({
        id: taskId,
        title: taskTitle,
        goal,
        status: 'planning',
        visibility: options.visibility === 'private' ? 'private' : 'public',
        createdBy: 'operator',
        workspace: resolvedWorkspace.absoluteRoot,
        metadata: {
          mode: resolvedWorkspace.mode,
          workspaceRoot: resolvedWorkspace.root,
          isGitRepo: gitInfo.isGitRepo,
          branch: gitInfo.branch,
          headCommit: gitInfo.headCommit,
          workflow: options.workflow,
        },
        createdAt: getTimestamp(),
        updatedAt: getTimestamp(),
      });
    } catch (err) {
      logger.error('Failed to create task in storage: ' + sanitizeErrorMessage(err));
      process.exit(1);
    }

    // Publish workspace_opened event
    await eventBus.publish({
      eventId: generateId('evt'),
      taskId,
      type: 'workspace_opened',
      timestamp: getTimestamp(),
      actorType: 'system',
      actorId: 'workspace_guard',
      correlationId,
      payload: {
        workspaceRoot: resolvedWorkspace.root,
        absoluteRoot: resolvedWorkspace.absoluteRoot,
        mode: resolvedWorkspace.mode,
        isGitRepo: gitInfo.isGitRepo,
        branch: gitInfo.branch,
        headCommit: gitInfo.headCommit,
      },
    });

    // Publish workspace_mode_set event
    await eventBus.publish({
      eventId: generateId('evt'),
      taskId,
      type: 'workspace_mode_set',
      timestamp: getTimestamp(),
      actorType: 'system',
      actorId: 'workspace_guard',
      correlationId,
      payload: {
        mode: resolvedWorkspace.mode,
        reason: `Workspace initialized in ${resolvedWorkspace.mode} mode`,
      },
    });

    // Publish task_created event
    await eventBus.publish({
      eventId: generateId('evt'),
      taskId,
      type: 'task_created',
      timestamp: getTimestamp(),
      actorType: 'user',
      actorId: 'operator',
      correlationId,
      payload: {
        title: task.title,
        goal: task.goal,
        visibility: task.visibility,
        createdBy: 'operator',
      },
    });

    const plannerAgent = new PlannerAgent({
      provider,
      eventBus,
      usageRepo,
      maxRepairRetries: llmConfig.maxRetries,
    });

    const abortController = new AbortController();
    const specialistRegistry = createSpecialistAgentRegistry({ mock: forceMock });
    const executionEngine = new ExecutionEngine({
      taskRepo,
      taskNodeRepo,
      artifactService,
      eventBus,
      llmProvider: provider,
      usageRepo,
      agentRegistry: specialistRegistry,
      toolRegistry,
      sandbox,
      permissionService,
      approvalEngine,
      crashRecoveryService,
    });

    let currentPlan: ProposedPlan | null = null;
    let inkInstance: ReturnType<typeof render> | null = null;
    const runInteractive = options.tui && Boolean(process.stdout.isTTY);

    // Helper to persist approved plan nodes and transition task status
    const executeApproval = async (plan: ProposedPlan, editedTasks?: ProposedPlanTaskState[]) => {
      const now = getTimestamp();
      const taskList = editedTasks || plan.tasks;
      const taskNodes: TaskNode[] = taskList.map((pt) => ({
        id: `${taskId}_${pt.id}`,
        taskId,
        title: pt.title,
        description: pt.description,
        assignedAgentRole: pt.assignedAgentRole as AgentRole,
        dependsOn: pt.dependsOn.map((depId) => depId.startsWith(`${taskId}_`) ? depId : `${taskId}_${depId}`),
        status: 'pending',
        acceptanceCriteria: pt.acceptanceCriteria,
        createdAt: now,
        updatedAt: now,
      }));

      await taskNodeRepo.createMany(taskNodes);
      await taskRepo.updateStatus(taskId, 'ready');

      await eventBus.publish({
        eventId: generateId('evt'),
        taskId,
        type: 'plan_approved',
        timestamp: getTimestamp(),
        actorType: 'user',
        actorId: 'operator',
        correlationId,
        payload: {
          approvedBy: 'operator',
          reason: `Operator approved plan: ${plan.title} (${taskNodes.length} nodes)`,
        },
      });

      await eventBus.publish({
        eventId: generateId('evt'),
        taskId,
        type: 'task_updated',
        timestamp: getTimestamp(),
        actorType: 'system',
        actorId: 'system',
        correlationId,
        payload: {
          status: 'ready',
          patch: { status: 'ready' },
        },
      });

      if (!runInteractive) {
        logger.info(green(`\n✔ Plan "${plan.title}" approved by operator.`));
        logger.info(cyan(`  Persisted ${taskNodes.length} task nodes to SQLite.`));
        logger.info(yellow(`  Task status is now READY.`));
      }

      if (options.planOnly) {
        if (!runInteractive) {
          logger.info(yellow(`  Task status is now READY. Milestone 4 complete.\n`));
        }
        return;
      }

      // Milestone 5: Specialist Agent Execution Engine
      if (!runInteractive) {
        logger.info(bold(cyan(`\nStarting specialist agent execution engine (concurrency: ${concurrencyNum})...\n`)));
      }

      const runPromise = executionEngine.runTask(taskId, {
        concurrency: concurrencyNum,
        fast: options.fast,
        signal: abortController.signal,
        maxInputTokens: options.maxInputTokens,
        noStream: options.stream === false,
        model: llmConfig.model,
        workspaceRoot: resolvedWorkspace.absoluteRoot,
        mode: resolvedWorkspace.mode,
      });

      if (!runInteractive) {
        const result = await runPromise;
        if (result.taskStatus === 'done') {
          const allArtifacts = await artifactService.listArtifacts(taskId);
          const changeSummary = allArtifacts.find(
            (a) => a.path.endsWith('change-summary.md') || a.title.toLowerCase().includes('change summary')
          );
          const diffArt = allArtifacts.find(
            (a) => a.path.endsWith('changes.diff') || a.title.toLowerCase().includes('diff')
          );
          const testReport = allArtifacts.find(
            (a) => a.path.endsWith('test-report.md') || a.title.toLowerCase().includes('test')
          );

          logger.info(green(`\n✔ Task "${taskTitle}" completed successfully!`));
          logger.info(bold('\nArtifacts Generated:'));
          if (changeSummary) logger.info(`  • Change Summary: ${cyan(changeSummary.path)}`);
          if (diffArt) logger.info(`  • Unified Diff:   ${cyan(diffArt.path)}`);
          if (testReport) logger.info(`  • Test Report:    ${cyan(testReport.path)}`);
          if (result.finalArtifact && !changeSummary && !diffArt && !testReport) {
            logger.info(bold(cyan(`  • Final Deliverable: ${result.finalArtifact.path}`)));
          }
          logger.info(bold('\nExecution Summary:'));
          logger.info(dim(`  Task ID:  ${taskId}`));
          logger.info(dim(`  Duration: ${(result.durationMs / 1000).toFixed(1)}s | Tokens: ${result.totalUsage.inputTokens + result.totalUsage.outputTokens} | Cost: $${(result.totalUsage.estimatedCostUsd ?? 0).toFixed(4)}`));
          logger.info(bold('\nNext commands:'));
          logger.info(`  agentfeed task ${taskId}`);
          logger.info(`  agentfeed events ${taskId}\n`);
        } else if (result.taskStatus === 'blocked') {
          logger.warn(yellow(`\n⚠ Task "${taskTitle}" is BLOCKED (${result.nodesBlocked} nodes blocked).\n`));
          process.exitCode = 1;
        } else {
          logger.error(red(`\n✖ Task "${taskTitle}" FAILED (${result.nodesFailed} nodes failed).\n`));
          process.exitCode = 1;
        }
      } else {
        void runPromise.then(() => {
          if (options.fast && !process.stdin.isTTY) {
            setTimeout(() => inkInstance?.unmount(), 600);
          }
        });
      }
    };

    const executeRejection = async (reason = 'Operator rejected proposed plan') => {
      await taskRepo.updateStatus(taskId, 'failed');

      await eventBus.publish({
        eventId: generateId('evt'),
        taskId,
        type: 'plan_rejected',
        timestamp: getTimestamp(),
        actorType: 'user',
        actorId: 'operator',
        correlationId,
        payload: {
          rejectedBy: 'operator',
          reason,
        },
      });

      await eventBus.publish({
        eventId: generateId('evt'),
        taskId,
        type: 'task_updated',
        timestamp: getTimestamp(),
        actorType: 'system',
        actorId: 'system',
        correlationId,
        payload: {
          status: 'failed',
          patch: { status: 'failed' },
        },
      });

      if (!runInteractive) {
        logger.info(red(`\n✖ Plan rejected: ${reason}`));
      }
    };

    const executeRevision = async (feedback: string) => {
      await eventBus.publish({
        eventId: generateId('evt'),
        taskId,
        type: 'plan_revision_requested',
        timestamp: getTimestamp(),
        actorType: 'user',
        actorId: 'operator',
        correlationId,
        payload: {
          requestedBy: 'operator',
          feedback,
        },
      });

      if (!runInteractive) {
        logger.info(cyan(`\n↺ Revision requested: "${feedback}". Re-running Planner...`));
      }

      currentPlan = await plannerAgent.generatePlan({
        taskId,
        goal,
        maxTasks: options.maxTasks,
        revisionFeedback: feedback,
      });

      // Handle CLI auto-approval after revision if flags were provided
      if (options.approve && currentPlan) {
        await executeApproval(currentPlan);
      }
    };

    // Controller passed into Ink TUI
    const controller: AppController = {
      stop: () => {
        abortController.abort();
        executionEngine.pause();
        if (inkInstance) {
          inkInstance.unmount();
        }
      },
      pause: () => {
        executionEngine.pause();
      },
      resume: () => {
        executionEngine.resume();
      },
      approvePlan: async (editedTasks?: ProposedPlanTaskState[]) => {
        if (currentPlan) {
          await executeApproval(currentPlan, editedTasks);
        }
      },
      rejectPlan: async () => {
        await executeRejection();
        setTimeout(() => {
          if (inkInstance) inkInstance.unmount();
        }, 800);
      },
      requestRevision: async (feedback: string) => {
        try {
          await executeRevision(feedback);
        } catch (err) {
          const msg = redactSensitiveText((err as Error).message);
          logger.error(`Revision planning failed: ${msg}`);
        }
      },
      approve: async (approvalId?: string) => {
        if (approvalId) {
          await approvalEngine.decideApproval(approvalId, true, 'operator');
        }
      },
      reject: async (approvalId?: string, reason?: string) => {
        if (approvalId) {
          await approvalEngine.decideApproval(approvalId, false, 'operator', reason);
        }
      },
      mentionAgent: async (agentRole: string, instruction: string) => {
        await executionEngine.addInstruction(agentRole, instruction);
      },
    };

    if (runInteractive) {
      inkInstance = render(
        React.createElement(App, {
          eventBus,
          runner: controller,
          onExit: () => {
            abortController.abort();
          },
        })
      );
    } else {
      // In non-TUI mode, log streaming events for transparency
      eventBus.on('*', (evt) => {
        if (evt.type === 'planner_message') {
          const p = evt.payload as { content?: string; phase?: string };
          logger.info(cyan(`[Planner] ${p.content || ''}`));
        } else if (evt.type === 'planner_response_received') {
          const p = evt.payload as { latencyMs?: number; usage?: { estimatedCostUsd?: number } };
          logger.info(dim(`[Planner] Response received in ${p.latencyMs}ms ($${p.usage?.estimatedCostUsd ?? 0})`));
        } else if (evt.type === 'plan_validation_failed') {
          const p = evt.payload as { errors?: string[]; attempt?: number };
          logger.warn(yellow(`[Planner] Plan validation failed (attempt ${p.attempt}): ${p.errors?.join('; ')}`));
        } else if (evt.type === 'node_started') {
          const p = evt.payload as { nodeId?: string };
          logger.info(cyan(`[Node Started] ${p.nodeId || ''}`));
        } else if (evt.type === 'agent_message') {
          const p = evt.payload as { content?: string; nodeId?: string };
          logger.info(dim(`[${evt.actorId}] ${p.content || ''}`));
        } else if (evt.type === 'context_built') {
          const p = evt.payload as { inputTokenBudget?: number; estimatedInputTokens?: number };
          logger.info(dim(`[Context] Assembled (${p.estimatedInputTokens} tok est. / ${p.inputTokenBudget} max)`));
        } else if (evt.type === 'llm_call_started') {
          const p = evt.payload as { model?: string; isStreaming?: boolean };
          logger.info(cyan(`[LLM Started] ${p.model || ''} (${p.isStreaming ? 'streaming' : 'non-streaming'})`));
        } else if (evt.type === 'llm_progress') {
          const p = evt.payload as { deltaText?: string; activity?: string };
          if (p.activity) logger.info(dim(`[LLM Progress] ${p.activity}`));
        } else if (evt.type === 'llm_call_completed') {
          const p = evt.payload as { latencyMs?: number; usage?: { inputTokens?: number; outputTokens?: number } };
          const tok = (p.usage?.inputTokens ?? 0) + (p.usage?.outputTokens ?? 0);
          logger.info(dim(`[LLM Completed] in ${p.latencyMs}ms (${tok} tok)`));
        } else if (evt.type === 'tool_call_completed') {
          const p = evt.payload as { toolName?: string; durationMs?: number; output?: unknown };
          if (p.output && typeof p.output === 'object' && 'error' in (p.output as Record<string, unknown>)) {
            logger.error(red(`[Tool Error] ${p.toolName || ''}: ${(p.output as Record<string, unknown>).error}`));
          } else {
            logger.info(dim(`[Tool] ${p.toolName || ''} (${p.durationMs || 0}ms)`));
          }
        } else if (evt.type === 'artifact_created') {
          const p = evt.payload as { title?: string; path?: string };
          logger.info(green(`[Artifact Created] ${p.title || ''} -> ${p.path || ''}`));
        } else if (evt.type === 'node_completed') {
          const p = evt.payload as { nodeId?: string; summary?: string };
          logger.info(green(`[Node Completed] ${p.nodeId || ''}: ${p.summary || ''}`));
        } else if (evt.type === 'node_retry_scheduled') {
          const p = evt.payload as { nodeId?: string; attempt?: number; delayMs?: number };
          logger.warn(yellow(`[Retry Scheduled] Node ${p.nodeId} attempt ${p.attempt} in ${p.delayMs}ms`));
        } else if (evt.type === 'user_instruction') {
          const p = evt.payload as { agentRole?: string; instruction?: string };
          logger.info(cyan(`[User Instruction] @${p.agentRole || 'agent'}: ${p.instruction || ''}`));
        } else if (evt.type === 'permission_checked') {
          const p = evt.payload as { agentRole?: string; permission?: string; allowed?: boolean; reason?: string };
          if (!p.allowed) {
            logger.warn(yellow(`[Permission Denied] Agent ${p.agentRole} denied ${p.permission}: ${p.reason}`));
          }
        } else if (evt.type === 'approval_requested') {
          const p = evt.payload as { action?: string; riskLevel?: string; reason?: string };
          logger.warn(yellow(`[Approval Required] Action "${p.action}" (${p.riskLevel} risk): ${p.reason}`));
        } else if (evt.type === 'approval_granted') {
          const p = evt.payload as { decidedBy?: string };
          logger.info(green(`[Approval Granted] Confirmed by ${p.decidedBy}`));
        } else if (evt.type === 'approval_denied') {
          const p = evt.payload as { decidedBy?: string; reason?: string };
          logger.warn(red(`[Approval Denied] Rejected by ${p.decidedBy}: ${p.reason}`));
        } else if (evt.type === 'changeset_proposed') {
          const p = evt.payload as { changesetId?: string; filesCount?: number; additions?: number; deletions?: number };
          logger.info(cyan(`[Changeset Proposed] ${p.changesetId} · ${p.filesCount} files (+${p.additions}/-${p.deletions})`));
        } else if (evt.type === 'changeset_approved') {
          const p = evt.payload as { changesetId?: string };
          logger.info(green(`[Changeset Approved] ${p.changesetId}`));
        } else if (evt.type === 'changeset_rejected') {
          const p = evt.payload as { changesetId?: string; reason?: string };
          logger.warn(red(`[Changeset Rejected] ${p.changesetId}: ${p.reason || 'by operator'}`));
        } else if (evt.type === 'changeset_applied') {
          const p = evt.payload as { changesetId?: string; appliedFiles?: string[] };
          logger.info(green(`[Changeset Applied] ${p.changesetId} (${p.appliedFiles?.length ?? 0} files written)`));
        } else if (evt.type === 'changeset_stale') {
          const p = evt.payload as { changesetId?: string; staleFiles?: string[] };
          logger.warn(yellow(`[Changeset Stale] ${p.changesetId} - modified files: ${p.staleFiles?.join(', ')}`));
        } else if (evt.type === 'file_backup_created') {
          const p = evt.payload as { backedUpFiles?: string[] };
          logger.info(dim(`[Backup Created] ${p.backedUpFiles?.length ?? 0} files preserved for rollback`));
        } else if (evt.type === 'file_rollback_completed') {
          const p = evt.payload as { restoredFiles?: string[] };
          logger.warn(yellow(`[Rollback Completed] Restored ${p.restoredFiles?.length ?? 0} files`));
        } else if (evt.type === 'run_started') {

          const p = evt.payload as { mode?: string; isResume?: boolean };
          logger.info(cyan(`[Run Started] Mode: ${p.mode}${p.isResume ? ' (resumed)' : ''}`));
        } else if (evt.type === 'run_interrupted') {
          const p = evt.payload as { reason?: string };
          logger.warn(yellow(`[Run Interrupted] ${p.reason}`));
        } else if (evt.type === 'run_recovered') {
          const p = evt.payload as { recoveredNodeIds?: string[] };
          logger.info(cyan(`[Run Recovered] Recovered ${p.recoveredNodeIds?.length ?? 0} nodes`));
        } else if (evt.type === 'checkpoint_saved') {
          const p = evt.payload as { checkpointId?: string };
          logger.info(dim(`[Checkpoint Saved] ${p.checkpointId}`));
        } else if (evt.type === 'error_occurred') {
          const p = evt.payload as { error?: string };
          logger.error(red(`[Error] ${p.error || ''}`));
        }
      });
    }

    try {
      if (options.workflow) {
        const template = defaultWorkflowRegistry.get(options.workflow);
        if (!template) {
          logger.error(`Workflow template "${options.workflow}" not found. Available: ${defaultWorkflowRegistry.list().map((w) => w.id).join(', ')}`);
          process.exit(1);
        }
        currentPlan = {
          title: `${template.name}: ${taskTitle}`,
          summary: template.description,
          assumptions: ['Workflow executed from template: ' + template.name],
          risks: ['Strict workspace boundaries and allowlists apply'],
          tasks: template.defaultTasks.map((t) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            assignedAgentRole: t.assignedAgentRole,
            dependsOn: t.dependsOn,
            acceptanceCriteria: t.acceptanceCriteria,
            estimatedEffort: t.estimatedEffort ?? 'medium',
          })),
        };

        await eventBus.publish({
          eventId: generateId('evt'),
          taskId,
          type: 'plan_proposed',
          timestamp: getTimestamp(),
          actorType: 'agent',
          actorId: 'agent_planner',
          correlationId,
          payload: {
            title: currentPlan.title,
            summary: currentPlan.summary,
            assumptions: currentPlan.assumptions,
            risks: currentPlan.risks,
            nodes: currentPlan.tasks as unknown as Array<Record<string, unknown>>,
          },
        });
      } else {
        // Generate initial plan
        currentPlan = await plannerAgent.generatePlan({
          taskId,
          goal,
          maxTasks: options.maxTasks,
        });
      }

      if (!currentPlan) {
        throw new Error('No plan was produced by planner or workflow template');
      }

      // Handle automated decisions (useful for scripts, CI, headless testing)
      if (options.approve) {
        await executeApproval(currentPlan);
        if (inkInstance && (options.planOnly || !runInteractive)) {
          setTimeout(() => inkInstance?.unmount(), 500);
        }
        return;
      }

      if (options.reject) {
        await executeRejection();
        if (inkInstance) {
          setTimeout(() => inkInstance?.unmount(), 500);
        }
        return;
      }

      if (options.revise) {
        await executeRevision(options.revise);
        return;
      }

      if (!runInteractive) {
        // In headless mode without explicit flag, display the proposed plan summary
        logger.info(bold(yellow(`\nProposed Plan: ${currentPlan.title}`)));
        logger.info(dim(currentPlan.summary));
        logger.info(`Tasks generated (${currentPlan.tasks.length}):`);
        currentPlan.tasks.forEach((t, i) => {
          logger.info(`  ${i + 1}. [${t.assignedAgentRole.toUpperCase()}] ${t.title}`);
        });
        logger.info(cyan(`\nTask ${taskId} is awaiting approval.`));
      } else {
        // Wait until TUI exits or user decides
        if (inkInstance) {
          await inkInstance.waitUntilExit();
        }
      }
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      const safeMsg = redactSensitiveText(rawMsg);
      logger.error(`Plan generation failed: ${safeMsg}`);

      try {
        await taskRepo.updateStatus(taskId, 'failed');
      } catch {
        // ignore secondary error on cleanup
      }

      if (inkInstance) {
        inkInstance.unmount();
      }
      process.exit(1);
    }
  });
