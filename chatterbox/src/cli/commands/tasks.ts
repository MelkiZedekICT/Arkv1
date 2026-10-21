import { Command } from 'commander';
import { join } from 'path';
import { resolveStorageDir } from '../../core/config/config.js';
import { getDatabase } from '../../core/storage/database.js';
import { TaskRepository } from '../../core/storage/repositories/task.repository.js';
import { logger } from '../../utils/logger.js';

import { symbols } from '../../tui/design/symbols.js';
import { isNoColor } from '../../tui/design/tokens.js';

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

      const noColor = isNoColor();
      const brandHeader = noColor ? '◆◇ Chatterbox · Tasks' : '\x1b[33m◆◇\x1b[0m \x1b[1mChatterbox\x1b[0m · \x1b[2mTasks\x1b[0m';

      if (tasks.length === 0) {
        logger.info(`\n${brandHeader}`);
        logger.info(symbols.makeDivider(60));
        logger.info('No tasks found in local storage.\n');
        logger.info('Run your first task:');
        logger.info(noColor ? '  agentfeed run "Build a REST API" --workspace ./my-project\n' : '  \x1b[36magentfeed run "Build a REST API" --workspace ./my-project\x1b[0m\n');
        return;
      }

      logger.info(`\n${brandHeader}`);
      logger.info(symbols.makeDivider(70));
      const headers = ['ID', 'STATUS', 'CREATED AT', 'TITLE'];
      const rows = tasks.map((t) => [
        t.id,
        `[${t.status.toUpperCase()}]`,
        new Date(t.createdAt).toLocaleString(),
        t.title.length > 40 ? `${t.title.slice(0, 37)}...` : t.title,
      ]);

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
      logger.info(noColor ? headerLine : `\x1b[2m${headerLine}\x1b[0m`);
      logger.info(symbols.makeDivider(headerLine.length + 4));

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
