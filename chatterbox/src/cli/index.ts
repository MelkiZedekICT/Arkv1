#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initCommand } from './commands/init.js';
import { taskCreateCommand } from './commands/task-create.js';
import { tasksCommand } from './commands/tasks.js';
import { taskViewCommand } from './commands/task-view.js';
import { eventsCommand } from './commands/events.js';
import { runCommand } from './commands/run.js';
import { demoCommand } from './commands/demo.js';
import { configCommand } from './commands/config.js';
import { logger } from '../utils/logger.js';

// Sanitize unhandled exceptions to prevent exposing raw stack traces or internal source code paths
process.on('uncaughtException', (err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(message);
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  logger.error(message);
  process.exit(1);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pkgPath = join(__dirname, '../../package.json');
let version = '1.0.0';
try {
  const pkgInfo = JSON.parse(readFileSync(pkgPath, 'utf8'));
  version = pkgInfo.version;
} catch {
  // fallback if running from test or bundled environment
}

const program = new Command();

program
  .name('chatterbox')
  .description('Chatterbox / AgentFeed - Terminal-first multi-agent orchestration control room')
  .version(version)
  .option('-v, --verbose', 'Enable verbose debugging output')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.verbose) {
      logger.setVerbose(true);
    }
  });

program.addCommand(initCommand);
program.addCommand(taskCreateCommand);
program.addCommand(tasksCommand);
program.addCommand(taskViewCommand);
program.addCommand(eventsCommand);
program.addCommand(runCommand);
program.addCommand(demoCommand);
program.addCommand(configCommand);

program.parse(process.argv);

