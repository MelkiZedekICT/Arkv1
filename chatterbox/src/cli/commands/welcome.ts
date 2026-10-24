import { Command } from 'commander';
import React from 'react';
import { render } from 'ink';
import { loadConfig } from '../../core/config/config.js';
import { loadStoredCredentials, checkApiKeyStatus } from '../../core/config/credential-store.js';
import {
  isValidProviderName,
  getProviderDefinition,
  ProviderName,
} from '../../core/config/provider-registry.js';
import { WelcomeScreen, WelcomeAction } from '../../tui/components/WelcomeScreen.js';
import { logger } from '../../utils/logger.js';

export const welcomeCommand = new Command('welcome')
  .description('Open the interactive welcome screen')
  .action(async () => {
    try {
      // Load stored credentials into env
      loadStoredCredentials();

      const config = loadConfig();
      const providerName = config.llm.provider;
      const isMock = providerName === 'mock';

      let providerConfigured = false;
      let displayProviderName: string | undefined;
      let displayModelName: string | undefined;

      if (!isMock && isValidProviderName(providerName)) {
        const def = getProviderDefinition(providerName as ProviderName);
        const keyStatus = checkApiKeyStatus(providerName as ProviderName, def.apiKeyEnvVar);

        if (keyStatus.isSet || !def.requiresApiKey) {
          providerConfigured = true;
          displayProviderName = def.displayName;
          displayModelName = config.llm.model;
        }
      }

      // Also check for openai-compatible with a set key
      if (!isMock && providerName === 'openai-compatible') {
        const envVar = config.llm.apiKeyEnvVar || 'OPENAI_API_KEY';
        const envKey = process.env[envVar];
        if (envKey && envKey.trim().length > 0) {
          providerConfigured = true;
          displayProviderName = 'OpenAI-compatible';
          displayModelName = config.llm.model;
        }
      }

      const instance = render(
        React.createElement(WelcomeScreen, {
          version: 'v0.2.0',
          providerConfigured,
          providerName: displayProviderName,
          modelName: displayModelName,
          onSelect: (action: WelcomeAction) => {
            instance.unmount();
            handleWelcomeAction(action);
          },
        })
      );

      await instance.waitUntilExit();
    } catch (err) {
      logger.error('Failed to show welcome screen: ' + String(err));
      process.exitCode = 1;
    }
  });

async function handleWelcomeAction(action: WelcomeAction): Promise<void> {
  switch (action) {
    case 'demo':
      // Dynamic import to avoid circular deps
      logger.info('\nStarting guided demo…\n');
      try {
        const { spawn } = await import('child_process');
        const child = spawn(process.argv[0], [...process.argv.slice(1, -1), 'demo'], {
          stdio: 'inherit',
          env: process.env,
        });
        child.on('exit', (code) => {
          process.exitCode = code ?? 0;
        });
      } catch {
        logger.info('Run: agentfeed demo');
      }
      break;

    case 'setup':
      logger.info('\nStarting provider setup…\n');
      try {
        const { spawn } = await import('child_process');
        const child = spawn(process.argv[0], [...process.argv.slice(1, -1), 'setup'], {
          stdio: 'inherit',
          env: process.env,
        });
        child.on('exit', (code) => {
          process.exitCode = code ?? 0;
        });
      } catch {
        logger.info('Run: agentfeed setup');
      }
      break;

    case 'start':
      logger.info('\nTo start a task, run:');
      logger.info('  agentfeed run "<your goal>" --workspace ./your-project\n');
      break;

    case 'tasks':
      logger.info('\nRun: agentfeed tasks\n');
      try {
        const { spawn } = await import('child_process');
        const child = spawn(process.argv[0], [...process.argv.slice(1, -1), 'tasks'], {
          stdio: 'inherit',
          env: process.env,
        });
        child.on('exit', (code) => {
          process.exitCode = code ?? 0;
        });
      } catch {
        logger.info('Run: agentfeed tasks');
      }
      break;

    case 'settings':
      logger.info('\nRun: agentfeed config\n');
      try {
        const { spawn } = await import('child_process');
        const child = spawn(process.argv[0], [...process.argv.slice(1, -1), 'config'], {
          stdio: 'inherit',
          env: process.env,
        });
        child.on('exit', (code) => {
          process.exitCode = code ?? 0;
        });
      } catch {
        logger.info('Run: agentfeed config');
      }
      break;

    case 'exit':
      break;
  }
}
