import { Command } from 'commander';
import { loadConfig } from '../../core/config/config.js';
import { logger } from '../../utils/logger.js';

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

export const configCommand = new Command('config')
  .description('Inspect current configuration and LLM provider credentials status')
  .option('--json', 'Output configuration in JSON format')
  .action((options) => {
    const config = loadConfig();
    const envVarName = config.llm.apiKeyEnvVar || 'OPENAI_API_KEY';
    const rawKey = process.env[envVarName];
    const isKeySet = Boolean(rawKey && rawKey.trim().length > 0);
    const keyLength = rawKey ? rawKey.trim().length : 0;

    if (options.json) {
      // Safe JSON output: strictly boolean isSet and keyLength, never the actual secret
      const safeConfig = {
        storageDir: config.storageDir,
        llm: {
          provider: config.llm.provider,
          model: config.llm.model,
          baseUrl: config.llm.baseUrl,
          apiKeyEnvVar: envVarName,
          keyConfigured: isKeySet,
          keyLength: isKeySet ? keyLength : 0,
          timeoutMs: config.llm.timeoutMs,
          maxRetries: config.llm.maxRetries,
        },
      };
      logger.info(JSON.stringify(safeConfig, null, 2));
      return;
    }

    logger.info(bold(cyan('\n Chatterbox / AgentFeed Configuration\n')));
    logger.info(`  ${bold('Storage Directory:')}   ${config.storageDir}`);
    logger.info(`  ${bold('LLM Provider:')}        ${yellow(config.llm.provider)}`);
    logger.info(`  ${bold('LLM Model:')}           ${green(config.llm.model)}`);
    logger.info(`  ${bold('Base URL:')}             ${config.llm.baseUrl}`);
    logger.info(`  ${bold('API Key Env Var:')}      ${envVarName}`);

    if (isKeySet) {
      logger.info(
        `  ${bold('API Key Status:')}       ${green(`[SET] (${keyLength} chars)`)}`
      );
    } else {
      logger.info(
        `  ${bold('API Key Status:')}       ${red('[NOT SET]')}`
      );
      if (config.llm.provider === 'openai-compatible') {
        logger.info(
          `  ${dim(`↳ Note: Set export ${envVarName}=... or pass --mock to run offline.`)}`
        );
      }
    }

    logger.info(`  ${bold('Timeout:')}               ${config.llm.timeoutMs}ms`);
    logger.info(`  ${bold('Max Retries:')}          ${config.llm.maxRetries}\n`);
  });
