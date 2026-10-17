import { Command } from 'commander';
import { join } from 'path';
import { resolveStorageDir } from '../../core/config/config.js';
import { getDatabase } from '../../core/storage/database.js';
import { TaskRepository } from '../../core/storage/repositories/task.repository.js';
import { EventStore } from '../../core/events/event-store.js';
import { EventBus } from '../../core/events/event-bus.js';
import { TaskService } from '../../core/task/task.service.js';
import { logger } from '../../utils/logger.js';

export const taskCreateCommand = new Command('task:create')
  .alias('task-create')
  .description('Create a new agent task')
  .argument('<goal>', 'The goal for the agent team to accomplish')
  .option('-t, --title <title>', 'Custom title for the task')
  .option('--visibility <visibility>', 'Task visibility ("private" or "public")', 'private')
  .action(async (goal: string, options: { title?: string; visibility?: string }) => {
    try {
      if (!goal || goal.trim().length === 0) {
        logger.error('Goal cannot be empty.');
        process.exitCode = 1;
        return;
      }

      const storageDir = resolveStorageDir();
      const dbPath = join(storageDir, 'local.db');
      const db = getDatabase(dbPath);

      const taskRepo = new TaskRepository(db);
      const eventStore = new EventStore(storageDir);
      const eventBus = new EventBus(eventStore);
      const taskService = new TaskService(taskRepo, eventBus);

      const task = await taskService.createTask({
        goal: goal.trim(),
        title: options.title?.trim(),
        visibility: options.visibility === 'public' ? 'public' : 'private',
      });

      const eventLogPath = eventStore.getEventFilePath(task.id);

      logger.info('\nTask created successfully:');
      logger.info(`  ID:        ${task.id}`);
      logger.info(`  Title:     ${task.title}`);
      logger.info(`  Goal:      ${task.goal}`);
      logger.info(`  Status:    ${task.status}`);
      logger.info(`  Created:   ${task.createdAt}`);
      logger.info(`  Event Log: ${eventLogPath}\n`);
    } catch (err) {
      logger.error('Failed to create task', err);
      process.exitCode = 1;
    }
  });
