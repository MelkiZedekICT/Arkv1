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
import { App, AppController } from '../../tui/App.js';
import { logger } from '../../utils/logger.js';
import { redactSensitiveText } from '../../utils/security.js';

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

interface ResumeCommandOptions {
  mock?: boolean;
  fast?: boolean;
  concurrency?: string;
  tui?: boolean;
}

export const resumeCommand = new Command('resume')
  .description('Resume execution of an interrupted or paused task')
  .argument('<taskId>', 'The unique ID of the task to resume')
  .option('--mock', 'Force the deterministic mock specialist agent runtime', true)
  .option('--fast', 'Reduce simulation delays for rapid execution', false)
  .option('--concurrency <n>', 'Maximum concurrent specialist agent nodes (default: 3)', '3')
  .option('--no-tui', 'Run in headless streaming console mode')
  .action(async (taskId: string, options: ResumeCommandOptions) => {
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

    const task = await taskRepo.getById(taskId);
    if (!task) {
      logger.error(`Task "${taskId}" not found.`);
      process.exit(1);
    }

    const nodes = await taskNodeRepo.listByTaskId(taskId);
    if (nodes.length === 0) {
      logger.error(`Task "${taskId}" has no task nodes to resume.`);
      process.exit(1);
    }

    const concurrencyNum = parseInt(options.concurrency || '3', 10) || 3;
    const isMock = options.mock !== false;
    const provider = createLlmProvider(config.llm, isMock);

    // Security & Sandbox Setup
    const permissionService = new DefaultPermissionService({ eventBus });
    const approvalEngine = new ApprovalEngine({
      approvalRepo,
      eventBus,
      autoApproveLowRisk: false,
    });
    const sandbox = new LocalSandboxService(baseDir);
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

    const abortController = new AbortController();
    const specialistRegistry = createSpecialistAgentRegistry({ mock: isMock });
    const engine = new ExecutionEngine({
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

    const runInteractive = options.tui !== false && Boolean(process.stdout.isTTY);
    let inkInstance: ReturnType<typeof render> | null = null;

    if (runInteractive) {
      const controller: AppController = {
        stop: () => {
          abortController.abort();
          engine.pause();
          if (inkInstance) inkInstance.unmount();
        },
        pause: () => engine.pause(),
        resume: () => engine.resume(),
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
          await engine.addInstruction(agentRole, instruction);
        },
      };

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
      // Non-TUI streaming event listener
      eventBus.on('*', (evt) => {
        if (evt.type === 'node_started') {
          const p = evt.payload as { nodeId?: string };
          logger.info(cyan(`[Node Started] ${p.nodeId || ''}`));
        } else if (evt.type === 'agent_message') {
          const p = evt.payload as { content?: string; nodeId?: string };
          logger.info(dim(`[${evt.actorId}] ${p.content || ''}`));
        } else if (evt.type === 'tool_call_completed') {
          const p = evt.payload as { toolName?: string; durationMs?: number };
          logger.info(dim(`[Tool] ${p.toolName || ''} (${p.durationMs || 0}ms)`));
        } else if (evt.type === 'artifact_created') {
          const p = evt.payload as { title?: string; path?: string };
          logger.info(green(`[Artifact Created] ${p.title || ''} -> ${p.path || ''}`));
        } else if (evt.type === 'node_completed') {
          const p = evt.payload as { nodeId?: string; summary?: string };
          logger.info(green(`[Node Completed] ${p.nodeId || ''}: ${p.summary || ''}`));
        } else if (evt.type === 'node_retry_scheduled') {
          const p = evt.payload as { nodeId?: string; attempt?: number; delayMs?: number };
          logger.warn(yellow(`[Retry Scheduled] Node ${p.nodeId} attempt ${p.attempt} in ${p.delayMs}ms`));
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
      logger.info(bold(cyan(`\nResuming task "${task.title}" (${taskId})...`)));
      const completedBefore = nodes.filter((n) => n.status === 'done').length;
      logger.info(dim(`Already completed: ${completedBefore}/${nodes.length} nodes.`));

      const result = await engine.resumeTask(taskId, {
        concurrency: concurrencyNum,
        fast: options.fast,
        signal: abortController.signal,
      });

      if (!runInteractive) {
        if (result.taskStatus === 'done') {
          logger.info(green(`\n✔ Task "${task.title}" completed successfully!`));
          if (result.finalArtifact) {
            logger.info(bold(cyan(`  Final Deliverable: ${result.finalArtifact.path}`)));
          }
          logger.info(dim(`  Duration: ${(result.durationMs / 1000).toFixed(1)}s | Tokens: ${result.totalUsage.inputTokens + result.totalUsage.outputTokens} | Cost: $${(result.totalUsage.estimatedCostUsd ?? 0).toFixed(4)}`));
        } else if (result.taskStatus === 'blocked') {
          logger.warn(yellow(`\n⚠ Task "${task.title}" is BLOCKED (${result.nodesBlocked} nodes blocked).`));
          process.exitCode = 1;
        } else {
          logger.error(red(`\n✖ Task "${task.title}" FAILED (${result.nodesFailed} nodes failed).`));
          process.exitCode = 1;
        }
      } else {
        if (inkInstance) {
          if (options.fast) {
            setTimeout(() => inkInstance?.unmount(), 600);
          }
          await inkInstance.waitUntilExit();
        }
      }
    } catch (err) {
      const msg = redactSensitiveText((err as Error).message);
      logger.error(`Failed to resume task: ${msg}`);
      if (inkInstance) inkInstance.unmount();
      process.exit(1);
    }
  });
