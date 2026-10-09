#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initCommand } from './commands/init.js';
import { tasksCommand } from './commands/tasks.js';
import { runCommand } from './commands/run.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json to get the version
// Note: In development we're running from src/, in production from dist/
const pkgPath = join(__dirname, '../../package.json');
let version = '1.0.0';
try {
  const pkgInfo = JSON.parse(readFileSync(pkgPath, 'utf8'));
  version = pkgInfo.version;
} catch (e) {
  // fallback if running from somewhere unexpected
}

const program = new Command();

program
  .name('agentfeed')
  .description('Terminal-first multi-agent orchestration product')
  .version(version);

program.addCommand(initCommand);
program.addCommand(tasksCommand);
program.addCommand(runCommand);

program.parse();
