import { describe, it, expect, vi, afterEach } from 'vitest';
import { MockPlannerProvider } from '../../src/core/llm/mock-planner-provider.js';
import { OpenAiCompatibleProvider } from '../../src/core/llm/openai-compatible-provider.js';
import { PlanValidator } from '../../src/core/agents/planner/plan-validator.js';

describe('LLM Providers', () => {
  describe('MockPlannerProvider', () => {
    it('generates a valid, acyclic proposed plan tailored to the goal', async () => {
      const provider = new MockPlannerProvider({ simulatedLatencyMs: 10 });
      const completion = await provider.complete({
        messages: [{ role: 'user', content: 'Design a distributed consensus cache' }],
        responseFormat: 'json',
      });

      expect(completion.provider).toBe('mock');
      expect(completion.usage.inputTokens).toBeGreaterThan(0);
      expect(completion.usage.outputTokens).toBeGreaterThan(0);
      expect(completion.usage.estimatedCostUsd).toBeGreaterThanOrEqual(0);

      const parsed = JSON.parse(completion.text);
      const validation = PlanValidator.validate(parsed);

      expect(validation.isValid).toBe(true);
      expect(validation.plan).toBeDefined();
      expect(validation.plan?.tasks.length).toBe(5);
      expect(validation.plan?.title.toLowerCase()).toContain('distributed consensus cache');
    });

    it('respects requested maxTasks limit', async () => {
      const provider = new MockPlannerProvider({ simulatedLatencyMs: 5 });
      const completion = await provider.complete({
        messages: [{ role: 'user', content: 'Goal: Quick security audit\nMax Tasks: 3' }],
      });

      const parsed = JSON.parse(completion.text);
      expect(parsed.tasks.length).toBe(3);
      const validation = PlanValidator.validate(parsed);
      expect(validation.isValid).toBe(true);
    });
  });

  describe('OpenAiCompatibleProvider', () => {
    const originalEnv = process.env.CUSTOM_TEST_API_KEY;

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env.CUSTOM_TEST_API_KEY = originalEnv;
      } else {
        delete process.env.CUSTOM_TEST_API_KEY;
      }
      vi.restoreAllMocks();
    });

    it('throws clear error when required API key env var is missing', async () => {
      delete process.env.CUSTOM_TEST_API_KEY;
      const provider = new OpenAiCompatibleProvider({
        apiKeyEnvVar: 'CUSTOM_TEST_API_KEY',
      });

      await expect(
        provider.complete({
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).rejects.toThrow('Missing CUSTOM_TEST_API_KEY');
    });

    it('rejects unencrypted remote HTTP endpoints', () => {
      expect(() => {
        new OpenAiCompatibleProvider({
          baseUrl: 'http://insecure-remote-api.com/v1',
        });
      }).toThrow('Insecure HTTP protocol');
    });

    it('allows loopback HTTP endpoints for local models like Ollama or vLLM', () => {
      expect(() => {
        new OpenAiCompatibleProvider({
          baseUrl: 'http://localhost:11434/v1',
        });
      }).not.toThrow();

      expect(() => {
        new OpenAiCompatibleProvider({
          baseUrl: 'http://127.0.0.1:8000/v1',
        });
      }).not.toThrow();
    });

    it('redacts the API key from any thrown network or server errors', async () => {
      const secretKey = 'sk-proj-super-secret-testing-key-12345';
      process.env.CUSTOM_TEST_API_KEY = secretKey;

      const provider = new OpenAiCompatibleProvider({
        apiKeyEnvVar: 'CUSTOM_TEST_API_KEY',
        baseUrl: 'https://api.openai.com/v1',
        maxRetries: 0,
      });

      // Mock fetch to simulate an error that echoes the authorization header
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(
          new Error(`Connection failed with Authorization Bearer ${secretKey}`)
        )
      );

      await expect(
        provider.complete({
          messages: [{ role: 'user', content: 'Ping' }],
        })
      ).rejects.toSatisfy((err: Error) => {
        expect(err.message).not.toContain(secretKey);
        expect(err.message).toContain('[REDACTED');
        return true;
      });
    });

    it('parses successful completions and calculates token cost estimates', async () => {
      process.env.CUSTOM_TEST_API_KEY = 'sk-valid-key-for-test';

      const provider = new OpenAiCompatibleProvider({
        apiKeyEnvVar: 'CUSTOM_TEST_API_KEY',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
      });

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            id: 'chatcmpl-mock-123',
            choices: [{ message: { content: '{"status":"ok"}' } }],
            usage: { prompt_tokens: 1000, completion_tokens: 500 },
          }),
        })
      );

      const result = await provider.complete({
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(result.text).toBe('{"status":"ok"}');
      expect(result.usage.inputTokens).toBe(1000);
      expect(result.usage.outputTokens).toBe(500);
      expect(result.usage.estimatedCostUsd).toBeGreaterThan(0);
      expect(result.requestId).toBe('chatcmpl-mock-123');
    });
  });
});
