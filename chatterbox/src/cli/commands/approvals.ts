import { Command } from 'commander';
import { join } from 'path';
import { resolveStorageDir } from '../../core/config/config.js';
import { getDatabase } from '../../core/storage/database.js';
import { ApprovalRepository } from '../../core/storage/repositories/approval.repository.js';
import { logger } from '../../utils/logger.js';
import { sanitizeErrorMessage } from '../../utils/security.js';

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

export const approvalsCommand = new Command('approvals')
  .description('List all approval decisions, pending requests, and risk evaluations for a task')
  .argument('<taskId>', 'The unique ID of the task')
  .option('--json', 'Output approvals as JSON')
  .action(async (taskId: string, options: { json?: boolean }) => {
    try {
      const baseDir = resolveStorageDir();
      const dbPath = join(baseDir, 'local.db');
      const db = getDatabase(dbPath);

      const approvalRepo = new ApprovalRepository(db);
      const items = await approvalRepo.listByTaskId(taskId);

      if (options.json) {
        console.log(JSON.stringify(items, null, 2));
        return;
      }

      if (items.length === 0) {
        logger.info(dim(`No approval records found for task "${taskId}".`));
        return;
      }

      logger.info(bold(cyan(`\nApprovals for task ${taskId} (${items.length}):`)));
      logger.info(
        dim(
          '------------------------------------------------------------------------------------------------------------------------'
        )
      );

      for (const item of items) {
        const statusColor =
          item.status === 'approved'
            ? green('APPROVED')
            : item.status === 'rejected'
            ? red('REJECTED')
            : yellow('PENDING');

        const riskColor =
          item.riskLevel === 'high'
            ? red('HIGH')
            : item.riskLevel === 'medium'
            ? yellow('MEDIUM')
            : green('LOW');

        logger.info(
          `• ID:       ${bold(item.id)}\n` +
          `  Agent:    ${item.requestedBy}\n` +
          `  Action:   ${bold(item.action)}\n` +
          `  Risk:     ${riskColor}\n` +
          `  Status:   ${statusColor}\n` +
          `  Decided:  ${item.decidedAt || dim('Pending decision')}\n` +
          `  Reason:   ${item.reason || dim('No reason recorded')}\n`
        );
      }
    } catch (err) {
      logger.error(`Failed to list approvals: ${sanitizeErrorMessage(err)}`);
      process.exit(1);
    }
  });
