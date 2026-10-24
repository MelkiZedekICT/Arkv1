import { Command } from 'commander';
import { loadConfig } from '../../core/config/config.js';
import { loadStoredCredentials, checkApiKeyStatus } from '../../core/config/credential-store.js';
import {
  isValidProviderName,
  getProviderDefinition,
  ProviderName,
} from '../../core/config/provider-registry.js';
import { logger } from '../../utils/logger.js';

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

export const configCommand = new Command('config')
  .description('Inspect current configuration and LLM provider credentials status')
  .option('--json', 'Output configuration in JSON format')
  .action((options) => {
    loadStoredCredentials();

    const config = loadConfig();
    const providerName = config.llm.provider;
    const isMock = providerName === 'mock';

    let displayProvider: string = providerName;
    let apiKeyEnvVar = config.llm.apiKeyEnvVar || 'OPENAI_API_KEY';
    let requiresKey = false;

    if (isValidProviderName(providerName)) {
      const def = getProviderDefinition(providerName as ProviderName);
      displayProvider = def.displayName;
      apiKeyEnvVar = def.apiKeyEnvVar;
      requiresKey = def.requiresApiKey;
    } else if (providerName === 'openai-compatible') {
      displayProvider = 'OpenAI-compatible';
      requiresKey = true;
    }

    const keyStatus = checkApiKeyStatus(
      isValidProviderName(providerName) ? (providerName as ProviderName) : 'openai',
      apiKeyEnvVar
    );

    if (options.json) {
      const safeConfig = {
        storageDir: config.storageDir,
        llm: {
          provider: providerName,
          displayProvider,
          model: config.llm.model,
          baseUrl: config.llm.baseUrl,
          apiKeyEnvVar,
          keyConfigured: keyStatus.isSet,
          keyLength: keyStatus.isSet ? (process.env[apiKeyEnvVar]?.trim().length ?? 0) : 0,
          keySource: keyStatus.source,
          timeoutMs: config.llm.timeoutMs,
          maxRetries: config.llm.maxRetries,
        },
      };
      logger.info(JSON.stringify(safeConfig, null, 2));
      return;
    }

    logger.info(`\n${bold('◆◇ Chatterbox / AgentFeed Configuration')}\n`);
    logger.info(`  ${bold('LLM Provider:')}        ${cyan(displayProvider)}`);
    logger.info(`  ${bold('LLM Model:')}           ${green(config.llm.model)}`);

    if (keyStatus.isSet) {
      logger.info(
        `  ${bold('API Key Status:')}       ${green(`[SET] (${keyStatus.masked})`)} ${dim(`[via ${keyStatus.source}]`)}`
      );
    } else if (isMock) {
      logger.info(`  ${bold('API Key Status:')}       ${dim('Not required (offline mock mode)')}`);
    } else if (requiresKey) {
      logger.info(`  ${bold('API Key Status:')}       ${red('[NOT SET]')}`);
      logger.info(`  ${dim(`Run: agentfeed setup or set export ${apiKeyEnvVar}="..."`)}`);
    } else {
      logger.info(`  ${bold('API Key Status:')}       ${dim('Not required')}`);
    }

    logger.info(`  ${bold('Base URL:')}             ${config.llm.baseUrl}`);
    logger.info(`  ${bold('Storage Directory:')}   ${config.storageDir}`);
    logger.info(`\n  ${dim('(API keys are never displayed in full.)')}\n`);
  });
