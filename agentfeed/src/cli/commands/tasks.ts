import { Command } from 'commander';
import { logger } from '../../utils/logger.js';

export const tasksCommand = new Command('tasks')
  .description('List previous tasks')
  .action(() => {
    // Milestone 1: Return a placeholder since DB isn't fully implemented yet
    logger.info('Tasks (Milestone 1 Preview):');
    logger.info('No tasks found. (Database integration coming in Milestone 2)');
  });
