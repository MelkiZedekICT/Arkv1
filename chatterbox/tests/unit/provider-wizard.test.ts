import { describe, it, expect } from 'vitest';
import {
  PROVIDER_DEFINITIONS,
  PROVIDER_DISPLAY_ORDER,
  isValidProviderName,
  getProviderDefinition,
  ProviderName,
} from '../../src/core/config/provider-registry.js';
import { createLlmProvider } from '../../src/core/llm/index.js';
import { OpenAiCompatibleProvider } from '../../src/core/llm/openai-compatible-provider.js';

describe('Provider Wizard & LLM Provider Factory', () => {
  it('defines all required providers in standard display order', () => {
    expect(PROVIDER_DISPLAY_ORDER).toContain('openai');
    expect(PROVIDER_DISPLAY_ORDER).toContain('anthropic');
    expect(PROVIDER_DISPLAY_ORDER).toContain('google-gemini');
    expect(PROVIDER_DISPLAY_ORDER).toContain('openrouter');
    expect(PROVIDER_DISPLAY_ORDER).toContain('groq');
    expect(PROVIDER_DISPLAY_ORDER).toContain('ollama');
    expect(PROVIDER_DISPLAY_ORDER).toContain('custom');
  });

  it('correctly validates valid provider names and rejects invalid ones', () => {
    expect(isValidProviderName('openai')).toBe(true);
    expect(isValidProviderName('anthropic')).toBe(true);
    expect(isValidProviderName('google-gemini')).toBe(true);
    expect(isValidProviderName('invalid-provider')).toBe(false);
    expect(isValidProviderName('')).toBe(false);
  });

  it('retrieves correct definition for each provider', () => {
    const openaiDef = getProviderDefinition('openai');
    expect(openaiDef.displayName).toBe('OpenAI');
    expect(openaiDef.baseUrl).toBe('https://api.openai.com/v1');
    expect(openaiDef.requiresApiKey).toBe(true);
    expect(openaiDef.popularModels).toContain('gpt-4.1-mini');

    const ollamaDef = getProviderDefinition('ollama');
    expect(ollamaDef.displayName).toBe('Ollama / Local');
    expect(ollamaDef.baseUrl).toBe('http://localhost:11434/v1');
    expect(ollamaDef.requiresApiKey).toBe(false);
  });

  it('createLlmProvider routes named providers through OpenAiCompatibleProvider with registry defaults', () => {
    process.env.OPENAI_API_KEY = 'sk-mock-test-key-000';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-000';

    const openaiProvider = createLlmProvider({
      provider: 'openai',
      model: 'gpt-4.1-mini',
      baseUrl: 'https://api.openai.com/v1',
      apiKeyEnvVar: 'OPENAI_API_KEY',
      temperature: 0.2,
      maxOutputTokens: 1000,
      timeoutMs: 5000,
      maxRetries: 1,
    });
    expect(openaiProvider).toBeInstanceOf(OpenAiCompatibleProvider);
    expect(openaiProvider.name).toBe('openai-compatible');

    const anthropicProvider = createLlmProvider({
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      baseUrl: 'https://api.anthropic.com/v1',
      apiKeyEnvVar: 'ANTHROPIC_API_KEY',
      temperature: 0.2,
      maxOutputTokens: 1000,
      timeoutMs: 5000,
      maxRetries: 1,
    });
    expect(anthropicProvider).toBeInstanceOf(OpenAiCompatibleProvider);
    expect(anthropicProvider.name).toBe('openai-compatible');

    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });
});
