import { Command } from 'commander';
import { loadConfig, saveConfig } from '../../core/config/config.js';
import { createModelProvider } from '../../core/llm/provider-factory.js';
import { ProviderName, isValidProviderName, getProviderDefinition } from '../../core/config/provider-registry.js';
import { ProviderNameEnum } from '../../core/config/schema.js';
import { isNoColor } from '../../tui/design/tokens.js';

const bold = (s: string) => (isNoColor() ? s : `\x1b[1m${s}\x1b[0m`);
const dim = (s: string) => (isNoColor() ? s : `\x1b[2m${s}\x1b[0m`);
const green = (s: string) => (isNoColor() ? s : `\x1b[32m${s}\x1b[0m`);
const red = (s: string) => (isNoColor() ? s : `\x1b[31m${s}\x1b[0m`);
const cyan = (s: string) => (isNoColor() ? s : `\x1b[36m${s}\x1b[0m`);

export const providerCommand = new Command('provider').description('Configure and test model providers');

providerCommand
  .command('set <name>')
  .description('Set active provider and optional model / baseUrl')
  .option('-m, --model <model>', 'Default model identifier')
  .option('-b, --base-url <url>', 'Base API URL')
  .action((name: string, options: { model?: string; baseUrl?: string }) => {
    const lowerName = name.toLowerCase();

    if (lowerName !== 'mock' && !isValidProviderName(lowerName)) {
      console.error(
        red(`\nUnknown provider "${name}". Valid providers: mock, ollama, openrouter, openai, anthropic, google-gemini, custom\n`)
      );
      process.exit(1);
    }

    const currentConfig = loadConfig();
    let defaultModel = options.model;
    let baseUrl = options.baseUrl;

    if (lowerName !== 'mock' && isValidProviderName(lowerName)) {
      const def = getProviderDefinition(lowerName as ProviderName);
      if (!defaultModel) defaultModel = def.defaultModel;
      if (!baseUrl) baseUrl = def.baseUrl;
    }

    const updated = saveConfig({
      modelProvider: lowerName as ProviderNameEnum,
      model: defaultModel || currentConfig.model,
      llm: {
        ...currentConfig.llm,
        provider: lowerName as ProviderNameEnum,
        model: defaultModel || currentConfig.llm.model,
        baseUrl: baseUrl || currentConfig.llm.baseUrl,
      },
    });

    console.log(green(`\n✓ Active provider updated to: ${cyan(updated.modelProvider)} (${updated.model})`));
    if (baseUrl) console.log(dim(`  Base URL: ${baseUrl}\n`));
  });

providerCommand
  .command('test [name]')
  .description('Run a live health check on a model provider')
  .action(async (name?: string) => {
    const config = loadConfig();
    const providerName = (name || config.modelProvider).toLowerCase();

    console.log(bold(`\nTesting connection to ${cyan(providerName)}...`));

    try {
      const llmConfig = {
        ...config.llm,
        provider: providerName as ProviderNameEnum,
        baseUrl: config.llm.baseUrl,
      };

      const provider = createModelProvider(llmConfig);
      const health = await provider.checkHealth();

      if (health.healthy) {
        console.log(green(`✓ Health check PASSED (${health.latencyMs ?? 0}ms)`));
        console.log(dim(`  Endpoint: ${health.endpoint}`));
        if (health.availableModels && health.availableModels.length > 0) {
          console.log(bold('\nAvailable models:'));
          health.availableModels.slice(0, 5).forEach((m) => {
            console.log(`  - ${cyan(m.id)} ${dim(m.description || '')}`);
          });
        }
        console.log('');
      } else {
        console.log(red(`✗ Health check FAILED`));
        console.log(red(`  ${health.error || 'Unknown error'}`));
        console.log(dim(`  Endpoint: ${health.endpoint}\n`));
      }
    } catch (err: unknown) {
      console.log(red(`\n✗ Provider test failed: ${String(err)}\n`));
    }
  });
