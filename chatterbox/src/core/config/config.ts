import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { Config, ConfigSchema } from './schema.js';

// Safely load local .env if available, without crashing if missing
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch {
    // .env is optional
  }
}

let cachedConfig: Config | null = null;

export function clearConfigCache(): void {
  cachedConfig = null;
}

export function resolveStorageDir(cwd = process.cwd()): string {
  const chatterboxDir = join(cwd, '.chatterbox');
  const agentfeedDir = join(cwd, '.agentfeed');

  if (existsSync(chatterboxDir)) {
    return chatterboxDir;
  }
  if (existsSync(agentfeedDir)) {
    return agentfeedDir;
  }
  return chatterboxDir;
}

export function loadConfig(cwd = process.cwd()): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  const storageDir = resolveStorageDir(cwd);
  const configPath = join(storageDir, 'config.json');

  if (!existsSync(configPath)) {
    cachedConfig = ConfigSchema.parse({ storageDir });
    return cachedConfig;
  }

  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
    cachedConfig = ConfigSchema.parse({
      ...raw,
      storageDir,
    });
    return cachedConfig;
  } catch {
    cachedConfig = ConfigSchema.parse({ storageDir });
    return cachedConfig;
  }
}

export function saveConfig(config: Partial<Config>, cwd = process.cwd()): Config {
  const storageDir = resolveStorageDir(cwd);
  mkdirSync(storageDir, { recursive: true });

  const existing = loadConfig(cwd);
  const updated = ConfigSchema.parse({
    ...existing,
    ...config,
    storageDir,
  });

  const configPath = join(storageDir, 'config.json');
  writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf-8');
  cachedConfig = updated;
  return updated;
}
