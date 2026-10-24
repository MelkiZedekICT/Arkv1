/**
 * Secure credential storage for Chatterbox.
 * Priority: environment variables > protected local file.
 *
 * SECURITY RULES:
 * - Never log, print, or include API keys in events/artifacts.
 * - Never store keys in config.json (that's for non-secret config).
 * - Mask keys whenever displayed to the user.
 * - Validate key presence without revealing the key.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';
import { resolveStorageDir } from './config.js';
import { ProviderName, maskApiKey } from './provider-registry.js';

const CREDENTIALS_FILENAME = 'credentials.json';

interface StoredCredentials {
  [providerName: string]: {
    apiKeyEnvVar: string;
    hasStoredKey: boolean;
  };
}

interface CredentialFileContent {
  _warning: string;
  credentials: {
    [providerName: string]: {
      apiKey: string;
      apiKeyEnvVar: string;
    };
  };
}

/**
 * Check if an API key is available for the given provider.
 * Returns the env var name and whether the key is set.
 */
export function checkApiKeyStatus(
  providerName: ProviderName,
  apiKeyEnvVar: string
): { isSet: boolean; source: 'env' | 'file' | 'none'; masked: string } {
  // 1. Check environment variable first (preferred)
  const envKey = process.env[apiKeyEnvVar];
  if (envKey && envKey.trim().length > 0) {
    return {
      isSet: true,
      source: 'env',
      masked: maskApiKey(envKey.trim()),
    };
  }

  // 2. Check protected credential file
  const fileKey = readKeyFromFile(providerName);
  if (fileKey && fileKey.trim().length > 0) {
    return {
      isSet: true,
      source: 'file',
      masked: maskApiKey(fileKey.trim()),
    };
  }

  return { isSet: false, source: 'none', masked: '' };
}

/**
 * Retrieve the API key for a provider. Used internally by the LLM layer.
 * Never expose the return value to logs, events, or UI.
 */
export function resolveApiKey(providerName: ProviderName, apiKeyEnvVar: string): string | undefined {
  // 1. Environment variable (preferred)
  const envKey = process.env[apiKeyEnvVar];
  if (envKey && envKey.trim().length > 0) {
    return envKey.trim();
  }

  // 2. Protected credential file
  const fileKey = readKeyFromFile(providerName);
  if (fileKey && fileKey.trim().length > 0) {
    return fileKey.trim();
  }

  return undefined;
}

/**
 * Store an API key securely.
 * Sets the key in the process environment and persists to a protected file.
 */
export function storeApiKey(
  providerName: ProviderName,
  apiKeyEnvVar: string,
  apiKey: string
): void {
  // 1. Set in current process environment
  process.env[apiKeyEnvVar] = apiKey;

  // 2. Persist to protected file
  writeKeyToFile(providerName, apiKeyEnvVar, apiKey);
}

/**
 * Get the stored credentials metadata (never returns actual keys).
 */
export function getStoredCredentialsMeta(): StoredCredentials {
  const storageDir = resolveStorageDir();
  const credPath = join(storageDir, CREDENTIALS_FILENAME);

  if (!existsSync(credPath)) {
    return {};
  }

  try {
    const raw = JSON.parse(readFileSync(credPath, 'utf-8')) as CredentialFileContent;
    const meta: StoredCredentials = {};
    for (const [name, entry] of Object.entries(raw.credentials || {})) {
      meta[name] = {
        apiKeyEnvVar: entry.apiKeyEnvVar,
        hasStoredKey: Boolean(entry.apiKey && entry.apiKey.trim().length > 0),
      };
    }
    return meta;
  } catch {
    return {};
  }
}

/**
 * Load all stored credentials into process.env at startup.
 * Called once during initialization to restore saved API keys.
 */
export function loadStoredCredentials(): void {
  const storageDir = resolveStorageDir();
  const credPath = join(storageDir, CREDENTIALS_FILENAME);

  if (!existsSync(credPath)) {
    return;
  }

  try {
    const raw = JSON.parse(readFileSync(credPath, 'utf-8')) as CredentialFileContent;
    for (const entry of Object.values(raw.credentials || {})) {
      if (entry.apiKey && entry.apiKeyEnvVar && !process.env[entry.apiKeyEnvVar]) {
        process.env[entry.apiKeyEnvVar] = entry.apiKey;
      }
    }
  } catch {
    // Ignore corrupted credential file
  }
}

// --- Private helpers ---

function readKeyFromFile(providerName: string): string | undefined {
  const storageDir = resolveStorageDir();
  const credPath = join(storageDir, CREDENTIALS_FILENAME);

  if (!existsSync(credPath)) {
    return undefined;
  }

  try {
    const raw = JSON.parse(readFileSync(credPath, 'utf-8')) as CredentialFileContent;
    return raw.credentials?.[providerName]?.apiKey;
  } catch {
    return undefined;
  }
}

function writeKeyToFile(providerName: string, apiKeyEnvVar: string, apiKey: string): void {
  const storageDir = resolveStorageDir();
  mkdirSync(storageDir, { recursive: true });

  const credPath = join(storageDir, CREDENTIALS_FILENAME);
  let content: CredentialFileContent;

  if (existsSync(credPath)) {
    try {
      content = JSON.parse(readFileSync(credPath, 'utf-8')) as CredentialFileContent;
    } catch {
      content = createEmptyCredentialFile();
    }
  } else {
    content = createEmptyCredentialFile();
  }

  content.credentials[providerName] = { apiKey, apiKeyEnvVar };
  writeFileSync(credPath, JSON.stringify(content, null, 2), 'utf-8');

  // Set file permissions to owner-only on Unix systems
  try {
    chmodSync(credPath, 0o600);
  } catch {
    // chmod may not work on Windows; the file is still protected by OS permissions
  }
}

function createEmptyCredentialFile(): CredentialFileContent {
  return {
    _warning: 'This file contains API keys. Do not commit to version control. Add .chatterbox/ to .gitignore.',
    credentials: {},
  };
}
