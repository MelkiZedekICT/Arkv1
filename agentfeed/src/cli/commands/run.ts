import { Command } from 'commander';
import { join } from 'path';
import { logger } from '../../utils/logger.js';
import { EventStore } from '../../core/events/event-store.js';
import { EventBus } from '../../core/events/event-bus.js';
import { TaskService } from '../../core/task/task.service.js';

export const runCommand = new Command('run')
  .description('Start a new agent task')
  .argument('<goal>', 'The goal for the agents to accomplish')
  .action(async (goal: string) => {
    logger.info(`Starting run command with goal: "${goal}"`);

    const baseDir = join(process.cwd(), '.agentfeed');
    const dbPath = join(baseDir, 'local.db');

    const eventStore = new EventStore(baseDir);
    const eventBus = new EventBus(eventStore);
    
    // Subscribe to all events to demonstrate they are flowing
    eventBus.on('*', (event) => {
      logger.info(`[Event] ${event.type} (${event.eventId})`);
    });

    const taskService = new TaskService(eventBus, dbPath);

    try {
      const taskId = await taskService.createTask(goal);
      logger.info(`\nSuccessfully created task: ${taskId}`);
      logger.info('Check .agentfeed/events.jsonl to see the persisted event.');
      logger.info('Check .agentfeed/local.db to see the persisted task.');
    } catch (e) {
      logger.error('Failed to create task: ' + (e as Error).message);
    }
  });
