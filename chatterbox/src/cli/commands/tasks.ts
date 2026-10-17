import { Command } from 'commander';
import { join } from 'path';
import { resolveStorageDir } from '../../core/config/config.js';
import { getDatabase } from '../../core/storage/database.js';
import { TaskRepository } from '../../core/storage/repositories/task.repository.js';
import { logger } from '../../utils/logger.js';

export const tasksCommand = new Command('tasks')
  .description('List previous tasks')
  .option('-l, --limit <number>', 'Maximum number of tasks to return', '20')
  .action(async (options: { limit: string }) => {
    try {
      const storageDir = resolveStorageDir();
      const dbPath = join(storageDir, 'local.db');
      const db = getDatabase(dbPath);
      const taskRepo = new TaskRepository(db);

      const limit = parseInt(options.limit, 10) || 20;
      const tasks = await taskRepo.list(limit);

      if (tasks.length === 0) {
        logger.info('No tasks found. Create one with `task:create "<goal>"`');
        return;
      }

      logger.info(`\nShowing ${tasks.length} task(s):\n`);
      const headers = ['ID', 'STATUS', 'CREATED AT', 'TITLE'];
      const rows = tasks.map((t) => [
        t.id,
        `[${t.status.toUpperCase()}]`,
        new Date(t.createdAt).toLocaleString(),
        t.title.length > 40 ? `${t.title.slice(0, 37)}...` : t.title,
      ]);

      // Simple tabular layout
      const colWidths = [
        Math.max(...rows.map((r) => r[0].length), headers[0].length) + 2,
        Math.max(...rows.map((r) => r[1].length), headers[1].length) + 2,
        Math.max(...rows.map((r) => r[2].length), headers[2].length) + 2,
        headers[3].length + 2,
      ];

      const headerLine =
        headers[0].padEnd(colWidths[0]) +
        headers[1].padEnd(colWidths[1]) +
        headers[2].padEnd(colWidths[2]) +
        headers[3];
      logger.info(headerLine);
      logger.info('-'.repeat(headerLine.length + 10));

      for (const row of rows) {
        logger.info(
          row[0].padEnd(colWidths[0]) +
            row[1].padEnd(colWidths[1]) +
            row[2].padEnd(colWidths[2]) +
            row[3]
        );
      }
      logger.info('');
    } catch (err) {
      logger.error('Failed to list tasks', err);
      process.exitCode = 1;
    }
  });
