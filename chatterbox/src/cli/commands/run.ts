import { Command } from 'commander';
import { join } from 'path';
import React from 'react';
import { render } from 'ink';
import { loadConfig, resolveStorageDir } from '../../core/config/config.js';
import { getDatabase } from '../../core/storage/database.js';
import { TaskRepository } from '../../core/storage/repositories/task.repository.js';
import { TaskNodeRepository } from '../../core/storage/repositories/task-node.repository.js';
import { UsageRepository } from '../../core/storage/repositories/usage.repository.js';
import { EventStore } from '../../core/events/event-store.js';
import { EventBus } from '../../core/events/event-bus.js';
import { createLlmProvider } from '../../core/llm/index.js';
import { PlannerAgent } from '../../core/agents/planner/planner.agent.js';
import { ProposedPlan } from '../../core/agents/planner/planner.schema.js';
import { TaskNode } from '../../core/models/task-node.js';
import { generateId } from '../../utils/ids.js';
import { getTimestamp } from '../../utils/time.js';
import { logger } from '../../utils/logger.js';
import { redactSensitiveText } from '../../utils/security.js';
import { App, AppController } from '../../tui/App.js';

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

interface RunCommandOptions {
  mock?: boolean;
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
}

export const runCommand = new Command('run')
  .description('Run Chatterbox / AgentFeed to plan and execute a goal')
  .argument('<goal>', 'The goal for the agent team to plan and accomplish')
  .option('--mock', 'Force the deterministic mock planner provider (no API key required)')
  .option('--title <title>', 'Custom title for the task')
  .option('--visibility <visibility>', 'Task visibility (public or private)', 'public')
  .option('--max-tasks <n>', 'Maximum number of tasks to generate', (val) => parseInt(val, 10))
  .option('--provider <provider>', 'LLM provider override (mock or openai-compatible)')
  .option('--model <model>', 'LLM model override')
  .option('--base-url <url>', 'LLM base URL override')
  .option('--no-tui', 'Run in headless non-interactive mode')
  .option('--approve', 'Automatically approve the proposed plan')
  .option('--reject', 'Automatically reject the proposed plan')
  .option('--revise <feedback>', 'Automatically request plan revision with specified feedback')
  .action(async (goal: string, options: RunCommandOptions) => {
    const config = loadConfig();
    const baseDir = resolveStorageDir();
    const dbPath = join(baseDir, 'local.db');
    const db = getDatabase(dbPath);

    const taskRepo = new TaskRepository(db);
    const taskNodeRepo = new TaskNodeRepository(db);
    const usageRepo = new UsageRepository(db);
    const eventStore = new EventStore(baseDir);
    const eventBus = new EventBus(eventStore);

    // Prepare LLM provider
    const llmConfig = { ...config.llm };
    if (options.provider) llmConfig.provider = options.provider;
    if (options.model) llmConfig.model = options.model;
    if (options.baseUrl) llmConfig.baseUrl = options.baseUrl;

    const forceMock = Boolean(options.mock || llmConfig.provider === 'mock');
    let provider;
    try {
      provider = createLlmProvider(llmConfig, forceMock);
    } catch (err) {
      const sanitized = redactSensitiveText((err as Error).message);
      logger.error(`Failed to initialize LLM provider: ${sanitized}`);
      process.exit(1);
    }

    // Create Task record
    const taskId = generateId('task');
    const taskTitle = options.title || (goal.length > 60 ? `${goal.slice(0, 57)}...` : goal);
    const correlationId = generateId('corr');

    let task;
    try {
      task = await taskRepo.create({
        id: taskId,
        title: taskTitle,
        goal,
        status: 'planning',
        visibility: options.visibility === 'private' ? 'private' : 'public',
        createdBy: 'operator',
        createdAt: getTimestamp(),
        updatedAt: getTimestamp(),
      });
    } catch (err) {
      logger.error('Failed to create task in storage: ' + (err as Error).message);
      process.exit(1);
    }

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

    let currentPlan: ProposedPlan | null = null;
    let inkInstance: ReturnType<typeof render> | null = null;

    // Helper to persist approved plan nodes and transition task status
    const executeApproval = async (plan: ProposedPlan) => {
      const now = getTimestamp();
      const taskNodes: TaskNode[] = plan.tasks.map((pt) => ({
        id: `${taskId}_${pt.id}`,
        taskId,
        title: pt.title,
        description: pt.description,
        assignedAgentRole: pt.assignedAgentRole,
        dependsOn: pt.dependsOn.map((depId) => `${taskId}_${depId}`),
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

      if (!options.tui) {
        logger.info(green(`\n✔ Plan "${plan.title}" approved by operator.`));
        logger.info(cyan(`  Persisted ${taskNodes.length} task nodes to SQLite.`));
        logger.info(yellow(`  Task status is now READY. Milestone 4 complete.\n`));
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

      if (!options.tui) {
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

      if (!options.tui) {
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
        if (inkInstance) {
          inkInstance.unmount();
        }
      },
      approvePlan: async () => {
        if (currentPlan) {
          await executeApproval(currentPlan);
          setTimeout(() => {
            if (inkInstance) inkInstance.unmount();
          }, 1200);
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
    };

    const runInteractive = options.tui && Boolean(process.stdout.isTTY);

    if (runInteractive) {
      inkInstance = render(
        React.createElement(App, {
          eventBus,
          runner: controller,
          onExit: () => {
            // cleanly exited
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
        }
      });
    }

    try {
      // Generate initial plan
      currentPlan = await plannerAgent.generatePlan({
        taskId,
        goal,
        maxTasks: options.maxTasks,
      });

      // Handle automated decisions (useful for scripts, CI, headless testing)
      if (options.approve) {
        await executeApproval(currentPlan);
        if (inkInstance) {
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
