import { Command } from 'commander';
import { resolveStorageDir } from '../../core/config/config.js';
import { EventStore } from '../../core/events/event-store.js';
import { logger } from '../../utils/logger.js';

export const eventsCommand = new Command('events')
  .description('Print all events for a task from the JSONL log')
  .argument('<taskId>', 'The unique ID of the task')
  .option('--json', 'Output raw JSON array of events')
  .option('-l, --limit <number>', 'Maximum number of events to output')
  .action(async (taskId: string, options: { json?: boolean; limit?: string }) => {
    try {
      const storageDir = resolveStorageDir();
      const eventStore = new EventStore(storageDir);

      let events = await eventStore.getEvents(taskId);

      if (options.limit) {
        const limitNum = parseInt(options.limit, 10);
        if (!isNaN(limitNum) && limitNum > 0) {
          events = events.slice(-limitNum);
        }
      }

      if (options.json) {
        console.log(JSON.stringify(events, null, 2));
        return;
      }

      if (events.length === 0) {
        logger.info(`No events found for task "${taskId}".`);
        return;
      }

      logger.info(`\nEvents for task "${taskId}" (${events.length} event(s)):\n`);
      for (const evt of events) {
        logger.info(
          `[${evt.timestamp}] ${evt.type.padEnd(20)} | Actor: ${evt.actorType}:${evt.actorId} | Corr: ${evt.correlationId}`
        );
        if (Object.keys(evt.payload).length > 0) {
          logger.info(`  Payload: ${JSON.stringify(evt.payload)}`);
        }
      }
      logger.info('');
    } catch (err) {
      logger.error('Failed to retrieve events', err);
      process.exitCode = 1;
    }
  });
