import { Command } from 'commander';
import { join } from 'path';
import { mkdirSync } from 'fs';
import React from 'react';
import { render } from 'ink';
import { resolveStorageDir } from '../../core/config/config.js';
import { getDatabase } from '../../core/storage/database.js';
import {
  TaskRepository,
  TaskNodeRepository,
  ArtifactRepository,
  ApprovalRepository,
  AgentRepository,
} from '../../core/storage/repositories/index.js';
import { EventStore } from '../../core/events/event-store.js';
import { EventBus } from '../../core/events/event-bus.js';
import { TaskService } from '../../core/task/task.service.js';
import { DemoRunner } from '../../core/simulation/demo-runner.js';
import { App } from '../../tui/App.js';
import { logger } from '../../utils/logger.js';

export const demoCommand = new Command('demo')
  .description('Run live terminal feed demonstration with simulated agents')
  .option('--fast', 'Reduce simulation delays for rapid testing', false)
  .option('--no-approve', 'Automatically grant approval requests without prompt', false)
  .option('--task-id <taskId>', 'Resume or replay an existing demo task (placeholder)')
  .action(async (options: { fast?: boolean; noApprove?: boolean; approve?: boolean; taskId?: string }) => {
    try {
      const isAutoApprove = options.approve === false || options.noApprove === true;

      if (options.taskId) {
        logger.info(`Replaying task "${options.taskId}" in live TUI is coming in Milestone 4.`);
        logger.info('Starting fresh demo simulation instead...\n');
      }

      const storageDir = resolveStorageDir();
      mkdirSync(storageDir, { recursive: true });
      const dbPath = join(storageDir, 'local.db');
      const db = getDatabase(dbPath);

      // Seed default agents if missing
      const agentRepo = new AgentRepository(db);
      await agentRepo.seedDefaultAgents();

      const taskRepo = new TaskRepository(db);
      const taskNodeRepo = new TaskNodeRepository(db);
      const artifactRepo = new ArtifactRepository(db);
      const approvalRepo = new ApprovalRepository(db);

      const eventStore = new EventStore(storageDir);
      const eventBus = new EventBus(eventStore);
      const taskService = new TaskService(taskRepo, eventBus);

      const runner = new DemoRunner({
        taskService,
        taskNodeRepo,
        artifactRepo,
        approvalRepo,
        eventBus,
        storageDir,
        fast: options.fast,
        noApprove: isAutoApprove,
      });

      // Render Ink application
      const appInstance = render(
        React.createElement(App, {
          eventBus,
          runner,
          onExit: () => {
            runner.stop();
          },
        })
      );

      // Start the demo runner in background
      void runner.run().then(() => {
        // In fast and auto-approve mode, or in headless/non-interactive environments, exit cleanly
        if ((options.fast && isAutoApprove) || !process.stdin.isTTY) {
          setTimeout(() => {
            appInstance.unmount();
          }, 300);
        }
      });

      // Wait until terminal exit is triggered
      await appInstance.waitUntilExit();
    } catch (err) {
      logger.error('Failed to run demo', err);
      process.exitCode = 1;
    }
  });
