import { Command } from 'commander';
import { defaultWorkflowRegistry } from '../../core/workflows/workflow-registry.js';
import { logger } from '../../utils/logger.js';

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

export const workflowsCommand = new Command('workflows')
  .description('Inspect available multi-agent workflow templates')
  .action(() => {
    listWorkflows();
  });

workflowsCommand
  .command('list')
  .description('List all registered workflow templates')
  .action(() => {
    listWorkflows();
  });

workflowsCommand
  .command('show <id>')
  .description('Show detailed task graph template for a specific workflow')
  .action((id: string) => {
    const template = defaultWorkflowRegistry.get(id);
    if (!template) {
      logger.error(`Workflow template "${id}" not found.`);
      logger.info(`Available workflows: ${defaultWorkflowRegistry.list().map((w) => w.id).join(', ')}`);
      process.exitCode = 1;
      return;
    }

    logger.info(`\n${bold(cyan(template.name))} (${dim(template.id)})`);
    logger.info(`Category: ${template.category} | Recommended Roles: ${template.recommendedRoles.join(', ')}`);
    logger.info(`Description: ${template.description}\n`);
    logger.info(bold('Default Task Graph:'));

    for (const task of template.defaultTasks) {
      const deps = task.dependsOn.length > 0 ? ` [depends on: ${task.dependsOn.join(', ')}]` : '';
      logger.info(`  • ${bold(task.id)}: ${task.title} (${yellow(task.assignedAgentRole)})${dim(deps)}`);
      logger.info(`    ${dim(task.description)}`);
      if (task.acceptanceCriteria.length > 0) {
        logger.info(`    Criteria:`);
        for (const ac of task.acceptanceCriteria) {
          logger.info(`      - ${ac}`);
        }
      }
    }
    logger.info('');
  });

function listWorkflows(): void {
  const templates = defaultWorkflowRegistry.list();
  logger.info(`\nAvailable Workflow Templates (${templates.length}):\n`);

  for (const t of templates) {
    logger.info(`  • ${bold(cyan(t.id.padEnd(20)))} ${bold(t.name)} [${t.category}]`);
    logger.info(`    ${dim(t.description)}`);
    logger.info(`    Roles: ${t.recommendedRoles.join(', ')} | Tasks: ${t.defaultTasks.length}`);
    logger.info('');
  }

  logger.info(`Use ${cyan('agentfeed workflows show <id>')} to view the task graph template.`);
  logger.info(`Use ${cyan('agentfeed run "<goal>" --workflow <id>')} to run with a specific template.\n`);
}
