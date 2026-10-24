import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  checkApiKeyStatus,
  resolveApiKey,
  storeApiKey,
  getStoredCredentialsMeta,
  loadStoredCredentials,
} from '../../src/core/config/credential-store.js';
import { maskApiKey, PROVIDER_DEFINITIONS } from '../../src/core/config/provider-registry.js';
import { clearConfigCache } from '../../src/core/config/config.js';

describe('CredentialStore & Provider Registry Security', () => {
  let tempDir: string;
  let originalCwd: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cb-cred-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
    clearConfigCache();
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
    process.env = { ...originalEnv };
    clearConfigCache();
  });

  it('correctly masks API keys preserving prefixes and hiding secret payload', () => {
    expect(maskApiKey('sk-1234567890abcdef1234567890')).toBe('sk-••••••••••••••••••••7890');
    expect(maskApiKey('short-key')).toBe('sho••-key');
    expect(maskApiKey('abc')).toBe('••••••••');
    expect(maskApiKey('')).toBe('••••••••');
  });

  it('detects when an API key is set in environment variable first (priority)', () => {
    process.env.OPENAI_API_KEY = 'sk-env-test-key-1234567890';
    const status = checkApiKeyStatus('openai', 'OPENAI_API_KEY');

    expect(status.isSet).toBe(true);
    expect(status.source).toBe('env');
    expect(status.masked).toContain('••••');
    expect(status.masked).not.toContain('env-test-key');

    const resolved = resolveApiKey('openai', 'OPENAI_API_KEY');
    expect(resolved).toBe('sk-env-test-key-1234567890');
  });

  it('stores API keys into protected local storage when env var is absent', () => {
    expect(checkApiKeyStatus('anthropic', 'ANTHROPIC_API_KEY').isSet).toBe(false);

    storeApiKey('anthropic', 'ANTHROPIC_API_KEY', 'sk-ant-test-key-9876543210');

    // Also sets in process.env
    expect(process.env.ANTHROPIC_API_KEY).toBe('sk-ant-test-key-9876543210');

    // Remove from env to test reading from file
    delete process.env.ANTHROPIC_API_KEY;

    const status = checkApiKeyStatus('anthropic', 'ANTHROPIC_API_KEY');
    expect(status.isSet).toBe(true);
    expect(status.source).toBe('file');
    expect(status.masked).toContain('••••');

    const resolved = resolveApiKey('anthropic', 'ANTHROPIC_API_KEY');
    expect(resolved).toBe('sk-ant-test-key-9876543210');
  });

  it('getStoredCredentialsMeta returns boolean flags and env var names, never the raw keys', () => {
    delete process.env.OPENAI_API_KEY;
    storeApiKey('openai', 'OPENAI_API_KEY', 'sk-super-secret-key-123456789');

    const meta = getStoredCredentialsMeta();
    expect(meta.openai).toBeDefined();
    expect(meta.openai?.hasStoredKey).toBe(true);
    expect(meta.openai?.apiKeyEnvVar).toBe('OPENAI_API_KEY');
    expect((meta.openai as any).apiKey).toBeUndefined();

    const credFilePath = join(tempDir, '.chatterbox', 'credentials.json');
    expect(existsSync(credFilePath)).toBe(true);
    const content = JSON.parse(readFileSync(credFilePath, 'utf-8'));
    expect(content._warning).toContain('Do not commit');
  });

  it('loadStoredCredentials restores credentials into process.env if not already set', () => {
    delete process.env.OPENAI_API_KEY;
    storeApiKey('openai', 'OPENAI_API_KEY', 'sk-restored-key-999');

    delete process.env.OPENAI_API_KEY;
    expect(process.env.OPENAI_API_KEY).toBeUndefined();

    loadStoredCredentials();
    expect(process.env.OPENAI_API_KEY).toBe('sk-restored-key-999');
  });

  it('loadStoredCredentials respects existing process.env variables and does not overwrite', () => {
    storeApiKey('openai', 'OPENAI_API_KEY', 'sk-file-key');
    process.env.OPENAI_API_KEY = 'sk-existing-env-key';

    loadStoredCredentials();
    expect(process.env.OPENAI_API_KEY).toBe('sk-existing-env-key');
  });

  it('all registered providers have valid configuration and required properties', () => {
    for (const [name, def] of Object.entries(PROVIDER_DEFINITIONS)) {
      expect(def.id).toBe(name);
      expect(def.displayName.length).toBeGreaterThan(0);
      if (name !== 'custom') {
        expect(def.baseUrl).toMatch(/^https?:\/\//);
        expect(def.popularModels.length).toBeGreaterThan(0);
        expect(def.defaultModel.length).toBeGreaterThan(0);
      }
      expect(def.apiKeyEnvVar.length).toBeGreaterThan(0);
      expect(typeof def.requiresApiKey).toBe('boolean');
    }
  });
});
