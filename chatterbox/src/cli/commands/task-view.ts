import { Command } from 'commander';
import { join } from 'path';
import { resolveStorageDir } from '../../core/config/config.js';
import { getDatabase } from '../../core/storage/database.js';
import { TaskRepository } from '../../core/storage/repositories/task.repository.js';
import { ArtifactRepository } from '../../core/storage/repositories/artifact.repository.js';
import { EventStore } from '../../core/events/event-store.js';
import { logger } from '../../utils/logger.js';

export const taskViewCommand = new Command('task')
  .description('Show task details, events, and artifacts')
  .argument('<taskId>', 'The unique ID of the task')
  .action(async (taskId: string) => {
    try {
      const storageDir = resolveStorageDir();
      const dbPath = join(storageDir, 'local.db');
      const db = getDatabase(dbPath);

      const taskRepo = new TaskRepository(db);
      const artifactRepo = new ArtifactRepository(db);
      const eventStore = new EventStore(storageDir);

      const task = await taskRepo.getById(taskId);
      if (!task) {
        logger.error(`Task "${taskId}" not found.`);
        process.exitCode = 1;
        return;
      }

      const replay = await eventStore.replayTask(taskId);
      const artifacts = await artifactRepo.listByTaskId(taskId);

      logger.info('\n==================== TASK DETAILS ====================');
      logger.info(`ID:         ${task.id}`);
      logger.info(`Title:      ${task.title}`);
      logger.info(`Status:     ${task.status.toUpperCase()}`);
      logger.info(`Goal:       ${task.goal}`);
      logger.info(`Creator:    ${task.createdBy}`);
      logger.info(`Visibility: ${task.visibility}`);
      logger.info(`Created At: ${task.createdAt}`);
      logger.info(`Updated At: ${task.updatedAt}`);
      logger.info(`Artifacts:  ${artifacts.length}`);
      logger.info(`Events:     ${replay.eventCount}`);

      if (artifacts.length > 0) {
        logger.info('\n--- Artifacts ---');
        for (const art of artifacts) {
          logger.info(`- [${art.type.toUpperCase()}] ${art.title} (${art.path})`);
        }
      }

      logger.info('\n--- Recent Events (Latest 10) ---');
      if (replay.events.length === 0) {
        logger.info('No events recorded yet.');
      } else {
        const recent = replay.events.slice(-10);
        for (const evt of recent) {
          logger.info(
            `[${evt.timestamp}] ${evt.type} by ${evt.actorType}:${evt.actorId} (${evt.eventId})`
          );
        }
      }
      logger.info('======================================================\n');
    } catch (err) {
      logger.error('Failed to view task', err);
      process.exitCode = 1;
    }
  });
