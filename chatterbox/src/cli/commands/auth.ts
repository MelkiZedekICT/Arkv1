import { Command } from 'commander';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { resolveStorageDir, loadConfig } from '../../core/config/config.js';
import { getStoredCredentialsMeta } from '../../core/config/credential-store.js';
import { PROVIDER_DEFINITIONS, ProviderName } from '../../core/config/provider-registry.js';
import { symbols } from '../../tui/design/symbols.js';
import { isNoColor } from '../../tui/design/tokens.js';

const bold = (s: string) => (isNoColor() ? s : `\x1b[1m${s}\x1b[0m`);
const dim = (s: string) => (isNoColor() ? s : `\x1b[2m${s}\x1b[0m`);
const green = (s: string) => (isNoColor() ? s : `\x1b[32m${s}\x1b[0m`);
const cyan = (s: string) => (isNoColor() ? s : `\x1b[36m${s}\x1b[0m`);

export const authCommand = new Command('auth').description('Manage local identity and credential storage');

authCommand
  .command('status')
  .description('Display local authentication state and provider credential availability')
  .action(() => {
    const config = loadConfig();
    const creds = getStoredCredentialsMeta();

    console.log(bold(`\n${symbols.logo.compactMark} Chatterbox Local Authentication & Identity`));
    console.log(dim('────────────────────────────────────────────────────────────────────────'));
    console.log(`${bold('Mode:')}         Local-first (Zero cloud dependencies)`);
    console.log(`${bold('User ID:')}      local-user`);
    console.log(`${bold('Display Name:')} Local Developer`);
    console.log(`${bold('Active:')}       ${cyan(config.modelProvider)} (${config.model})`);
    console.log(dim('────────────────────────────────────────────────────────────────────────'));

    console.log(bold('\nConfigured Provider Credentials:'));
    const names = Object.keys(PROVIDER_DEFINITIONS) as ProviderName[];
    for (const name of names) {
      const def = PROVIDER_DEFINITIONS[name];
      if (!def.requiresApiKey) {
        console.log(`  ${green('✓')} ${def.displayName.padEnd(20)} ${dim('No API key required (offline/local)')}`);
        continue;
      }

      const hasEnv = Boolean(process.env[def.apiKeyEnvVar]);
      const hasStored = Boolean(creds[name]?.hasStoredKey);

      if (hasEnv) {
        console.log(`  ${green('✓')} ${def.displayName.padEnd(20)} ${green('Loaded from environment')} ${dim(`(${def.apiKeyEnvVar})`)}`);
      } else if (hasStored) {
        console.log(`  ${green('✓')} ${def.displayName.padEnd(20)} ${green('Saved in protected credential storage')}`);
      } else {
        console.log(`  ${dim('○')} ${def.displayName.padEnd(20)} ${dim('Not configured')}`);
      }
    }
    console.log('');
  });

authCommand
  .command('logout')
  .description('Clear all stored provider credentials from local storage')
  .action(() => {
    const storageDir = resolveStorageDir();
    const credFile = join(storageDir, 'credentials.json');

    if (existsSync(credFile)) {
      try {
        unlinkSync(credFile);
        console.log(green('\n✓ Stored credentials cleared successfully from local storage.\n'));
      } catch (err: unknown) {
        console.error(`\nFailed to remove credentials file: ${String(err)}\n`);
      }
    } else {
      console.log(dim('\nNo stored credentials file found.\n'));
    }
  });
