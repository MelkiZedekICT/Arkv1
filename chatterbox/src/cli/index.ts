import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initCommand } from './commands/init.js';
import { taskCreateCommand } from './commands/task-create.js';
import { tasksCommand } from './commands/tasks.js';
import { taskViewCommand } from './commands/task-view.js';
import { eventsCommand } from './commands/events.js';
import { runCommand } from './commands/run.js';
import { resumeCommand } from './commands/resume.js';
import { demoCommand } from './commands/demo.js';
import { configCommand } from './commands/config.js';
import { approvalsCommand } from './commands/approvals.js';
import { workflowsCommand } from './commands/workflows.js';
import { evalCommand } from './commands/eval.js';
import { logger } from '../utils/logger.js';
import { symbols } from '../tui/design/symbols.js';
import { isNoColor } from '../tui/design/tokens.js';

//unhandled exceptions to prevent exposing raw stack traces or internal source code paths
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
let version = '0.1.1';
try {
  const pkgInfo = JSON.parse(readFileSync(pkgPath, 'utf8'));
  version = pkgInfo.version || '0.1.1';
} catch {
  // fallback if running from test or bundled environment
}

const binName = 'agentfeed';
const fullLogo = symbols.logo.getFullLogo();

const program = new Command();

program
  .name(binName)
  .description('Chatterbox - Terminal-native multiplayer control room for AI coding-agent teams')
  .version(version)
  .option('-v, --verbose', 'Enable verbose debugging output')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.verbose) {
      logger.setVerbose(true);
    }
  });

if (fullLogo) {
  const header = isNoColor()
    ? `${fullLogo}\n◆◇ Chatterbox · v${version}\n`
    : `\x1b[33m${fullLogo}\x1b[0m\n\x1b[1m◆◇ Chatterbox · v${version}\x1b[0m\n`;
  program.addHelpText('before', header);
}

program.addCommand(initCommand);
program.addCommand(taskCreateCommand);
program.addCommand(tasksCommand);
program.addCommand(taskViewCommand);
program.addCommand(eventsCommand);
program.addCommand(runCommand);
program.addCommand(resumeCommand);
program.addCommand(approvalsCommand);
program.addCommand(demoCommand);
program.addCommand(configCommand);
program.addCommand(workflowsCommand);
program.addCommand(evalCommand);

await program.parseAsync(process.argv);

