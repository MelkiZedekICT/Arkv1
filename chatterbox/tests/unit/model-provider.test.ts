import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createModelProvider,
  MockModelProvider,
  OllamaModelProvider,
  OpenRouterModelProvider,
  CustomModelProvider,
  ProviderRateLimitError,
  ProviderQuotaError,
} from '../../src/core/llm/index.js';

describe('Milestone A: Model Provider Abstraction', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('MockModelProvider', () => {
    it('initializes and reports healthy with zero network or API keys', async () => {
      const provider = new MockModelProvider();
      expect(provider.providerType).toBe('mock');
      expect(provider.endpoint).toContain('in-memory');

      const health = await provider.checkHealth();
      expect(health.healthy).toBe(true);
      expect(health.availableModels?.length).toBeGreaterThan(0);
    });

    it('generates simulated responses and supports streaming', async () => {
      const provider = new MockModelProvider();
      const chunks: string[] = [];
      const res = await provider.stream(
        {
          model: 'mock-balanced',
          messages: [{ role: 'user', content: 'Goal: Build a REST API with validation' }],
        },
        (chunk) => {
          if (chunk.text) chunks.push(chunk.text);
        }
      );

      expect(res.text.length).toBeGreaterThan(10);
      expect(chunks.length).toBeGreaterThan(0);
      expect(res.usage.inputTokens).toBeGreaterThan(0);
    });
  });

  describe('OllamaModelProvider', () => {
    it('configures default localhost endpoint and model', () => {
      const ollama = new OllamaModelProvider();
      expect(ollama.providerType).toBe('ollama');
      expect(ollama.endpoint).toBe('http://localhost:11434/v1');
      expect(ollama.defaultModel).toBe('qwen2.5-coder:7b');
    });

    it('reports health error with setup hint when Ollama server is unreachable', async () => {
      const ollama = new OllamaModelProvider({ baseUrl: 'http://127.0.0.1:54321/v1' });
      const health = await ollama.checkHealth();
      expect(health.healthy).toBe(false);
      expect(health.error).toContain('ollama serve');
    });
  });

  describe('OpenRouterModelProvider', () => {
    it('translates 429 rate limit errors with actionable fallback advice', async () => {
      const openrouter = new OpenRouterModelProvider({ apiKey: 'sk-or-test-dummy' });
      // Mock global fetch to simulate 429
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Rate limit exceeded' } }),
      } as any);

      await expect(
        openrouter.complete({
          model: 'openrouter/free',
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).rejects.toThrow(ProviderRateLimitError);
    });

    it('translates 402 quota errors with advice to use free models or mock mode', async () => {
      const openrouter = new OpenRouterModelProvider({ apiKey: 'sk-or-test-dummy' });
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 402,
        json: async () => ({ error: { message: 'Insufficient credits' } }),
      } as any);

      await expect(
        openrouter.complete({
          model: 'openrouter/free',
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).rejects.toThrow(ProviderQuotaError);
    });
  });

  describe('CustomModelProvider', () => {
    it('rejects unencrypted HTTP remote endpoints', () => {
      expect(() => {
        new CustomModelProvider({
          baseUrl: 'http://external-malicious-site.com/v1',
        });
      }).toThrow(/Insecure HTTP protocol/);
    });

    it('allows loopback HTTP endpoints for local development', () => {
      const provider = new CustomModelProvider({
        baseUrl: 'http://127.0.0.1:8080/v1',
      });
      expect(provider.endpoint).toBe('http://127.0.0.1:8080/v1');
    });
  });

  describe('Provider Factory', () => {
    it('creates MockModelProvider when forceMock is true or provider is mock', () => {
      const provider = createModelProvider({ provider: 'mock' } as any);
      expect(provider.providerType).toBe('mock');

      const forced = createModelProvider({ provider: 'openai' } as any, true);
      expect(forced.providerType).toBe('mock');
    });

    it('creates OllamaModelProvider for ollama', () => {
      const provider = createModelProvider({ provider: 'ollama' } as any);
      expect(provider.providerType).toBe('ollama');
    });

    it('creates OpenRouterModelProvider for openrouter', () => {
      const provider = createModelProvider({ provider: 'openrouter' } as any);
      expect(provider.providerType).toBe('openrouter');
    });
  });
});
