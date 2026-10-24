import { Command } from 'commander';
import React from 'react';
import { render } from 'ink';
import { loadConfig, saveConfig } from '../../core/config/config.js';
import { ProviderNameEnum, LlmConfig } from '../../core/config/schema.js';
import { loadStoredCredentials, checkApiKeyStatus } from '../../core/config/credential-store.js';
import {
  PROVIDER_DEFINITIONS,
  isValidProviderName,
  getProviderDefinition,
  ProviderName,
  PROVIDER_DISPLAY_ORDER,
} from '../../core/config/provider-registry.js';
import { ModelSwitcher } from '../../tui/components/ModelSwitcher.js';
import { logger } from '../../utils/logger.js';

export const modelCommand = new Command('model')
  .description('Switch AI provider and model')
  .action(async () => {
    try {
      loadStoredCredentials();

      const config = loadConfig();
      const currentProvider = config.llm.provider;
      const currentModel = config.llm.model;

      // Build model options from configured providers
      interface ModelOptionEntry {
        provider: string;
        model: string;
        isCurrent: boolean;
      }

      const options: ModelOptionEntry[] = [];

      for (const pName of PROVIDER_DISPLAY_ORDER) {
        if (pName === 'custom') continue;
        const def = PROVIDER_DEFINITIONS[pName];

        // Only show providers that have a key configured (or don't need one)
        const keyStatus = checkApiKeyStatus(pName, def.apiKeyEnvVar);
        if (!def.requiresApiKey || keyStatus.isSet) {
          for (const model of def.popularModels) {
            options.push({
              provider: def.displayName,
              model,
              isCurrent: currentProvider === pName && currentModel === model,
            });
          }
        }
      }

      // Also check openai-compatible
      if (currentProvider === 'openai-compatible') {
        const envVar = config.llm.apiKeyEnvVar || 'OPENAI_API_KEY';
        const envKey = process.env[envVar];
        if (envKey && envKey.trim().length > 0) {
          options.push({
            provider: 'OpenAI-compatible',
            model: currentModel,
            isCurrent: true,
          });
        }
      }

      if (options.length === 0) {
        logger.info('\nNo providers configured. Run: agentfeed setup\n');
        return;
      }

      let currentDisplayProvider = 'Mock';
      if (isValidProviderName(currentProvider)) {
        currentDisplayProvider = getProviderDefinition(currentProvider as ProviderName).displayName;
      } else if (currentProvider === 'openai-compatible') {
        currentDisplayProvider = 'OpenAI-compatible';
      }

      const instance = render(
        React.createElement(ModelSwitcher, {
          currentProvider: currentDisplayProvider,
          currentModel,
          options,
          onSelect: (provider: string, model: string) => {
            instance.unmount();
            applyModelSwitch(provider, model);
          },
          onCancel: () => {
            instance.unmount();
          },
        })
      );

      await instance.waitUntilExit();
    } catch (err) {
      logger.error('Model switch failed: ' + String(err));
      process.exitCode = 1;
    }
  });

function applyModelSwitch(displayProvider: string, model: string): void {
  const config = loadConfig();

  // Resolve display name back to provider name
  let providerName: string = config.llm.provider;
  for (const pName of PROVIDER_DISPLAY_ORDER) {
    const def = PROVIDER_DEFINITIONS[pName];
    if (def.displayName === displayProvider) {
      providerName = pName;
      break;
    }
  }

  saveConfig({
    ...config,
    modelProvider: providerName as ProviderNameEnum,
    model,
    llm: {
      ...config.llm,
      provider: providerName as LlmConfig['provider'],
      model,
    },
  });

  logger.info(`\n✓ Model switched to ${displayProvider} · ${model}\n`);
}
