import { Command } from 'commander';
import React from 'react';
import { render } from 'ink';
import { loadConfig, saveConfig } from '../../core/config/config.js';
import { storeApiKey, loadStoredCredentials } from '../../core/config/credential-store.js';
import { getProviderDefinition } from '../../core/config/provider-registry.js';
import { ProviderWizard, ProviderWizardResult } from '../../tui/components/ProviderWizard.js';
import { logger } from '../../utils/logger.js';

export const setupCommand = new Command('setup')
  .description('Set up AI provider, API key, and model')
  .action(async () => {
    try {
      loadStoredCredentials();

      const instance = render(
        React.createElement(ProviderWizard, {
          onComplete: (result: ProviderWizardResult) => {
            instance.unmount();
            completeSetup(result);
          },
          onCancel: () => {
            instance.unmount();
            logger.info('\nSetup cancelled.\n');
          },
        })
      );

      await instance.waitUntilExit();
    } catch (err) {
      logger.error('Setup failed: ' + String(err));
      process.exitCode = 1;
    }
  });

function completeSetup(result: ProviderWizardResult): void {
  const provDef = getProviderDefinition(result.providerName);

  // Store the API key securely (env var + protected file)
  if (result.apiKey && result.apiKey.trim().length > 0) {
    storeApiKey(result.providerName, provDef.apiKeyEnvVar, result.apiKey.trim());
  }

  // Save non-secret config
  const config = loadConfig();
  saveConfig({
    ...config,
    modelProvider: result.providerName,
    model: result.model,
    llm: {
      ...config.llm,
      provider: result.providerName,
      model: result.model,
      baseUrl: result.baseUrl || provDef.baseUrl,
      apiKeyEnvVar: provDef.apiKeyEnvVar,
    },
  });

  logger.info(`\n✓ Provider: ${provDef.displayName}`);
  logger.info(`✓ Model: ${result.model}`);
  logger.info(`✓ Configuration saved.\n`);
}
