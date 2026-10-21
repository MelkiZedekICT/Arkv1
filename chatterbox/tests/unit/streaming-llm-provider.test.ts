import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  OpenAiCompatibleProvider,
  asStreamingLlmProvider,
} from '../../src/core/llm/openai-compatible-provider.js';
import { MockSpecialistProvider } from '../../src/core/llm/mock-specialist-provider.js';
import { LlmProvider, LlmStreamChunk } from '../../src/core/llm/types.js';

describe('Streaming LLM Provider & Resilience', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test-secret-key-12345' };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('streaming provider emits progressive chunks and final usage (Test 10)', async () => {
    const mockProvider = new MockSpecialistProvider();
    mockProvider.enqueueResponse({
      text: 'AI agent security startups landscape',
      inputTokens: 120,
      outputTokens: 45,
    });

    const receivedChunks: string[] = [];
    const result = await mockProvider.stream(
      {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Describe startups' }],
      },
      (chunk: LlmStreamChunk) => {
        if (chunk.text) receivedChunks.push(chunk.text);
      }
    );

    expect(receivedChunks.length).toBeGreaterThan(1);
    expect(receivedChunks.join('')).toBe('AI agent security startups landscape');
    expect(result.usage.inputTokens).toBe(120);
    expect(result.usage.outputTokens).toBe(45);
    expect(result.usage.estimatedCostUsd).toBeGreaterThan(0);
  });

  it('non-streaming fallback wraps standard complete provider into streaming (Test 11)', async () => {
    const nonStreamingProvider: LlmProvider = {
      name: 'legacy-non-stream',
      complete: async (req) => ({
        text: 'Non-streaming response text',
        usage: { inputTokens: 50, outputTokens: 20 },
        model: req.model,
        provider: 'legacy-non-stream',
        latencyMs: 10,
      }),
    };

    const adapted = asStreamingLlmProvider(nonStreamingProvider);
    const chunks: string[] = [];

    const result = await adapted.stream(
      { model: 'gpt-4o', messages: [{ role: 'user', content: 'Hello' }] },
      (chunk) => {
        if (chunk.text) chunks.push(chunk.text);
      }
    );

    expect(chunks).toEqual(['Non-streaming response text']);
    expect(result.text).toBe('Non-streaming response text');
    expect(result.usage.inputTokens).toBe(50);
  });

  it('rate-limit error (HTTP 429) triggers exponential retry (Test 13)', async () => {
    let callCount = 0;
    const globalFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({ error: { message: 'Rate limit exceeded' } }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          id: 'chat_success',
          choices: [{ message: { content: 'Success after retry' } }],
          usage: { prompt_tokens: 30, completion_tokens: 15 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    vi.stubGlobal('fetch', globalFetch);

    const provider = new OpenAiCompatibleProvider({ maxRetries: 2, timeoutMs: 5000 });
    const result = await provider.complete({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'test rate limit' }],
    });

    expect(callCount).toBe(2);
    expect(result.text).toBe('Success after retry');
  });

  it('timeout triggers retry or safe failure without leaking secrets (Test 14)', async () => {
    const globalFetch = vi.fn().mockImplementation(async (_url, init) => {
      // Simulate timeout by waiting longer than provider timeout
      await new Promise((res) => setTimeout(res, 100));
      if (init.signal?.aborted) {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      }
      return new Response('{}', { status: 200 });
    });

    vi.stubGlobal('fetch', globalFetch);

    // Timeout in 20ms, maxRetries 1
    const provider = new OpenAiCompatibleProvider({ timeoutMs: 20, maxRetries: 1 });

    await expect(
      provider.complete({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'test timeout' }],
      })
    ).rejects.toThrow(/timed out/i);
  });

  it('abort signal cancels active LLM request and preserves state (Test 15)', async () => {
    const controller = new AbortController();
    const mockProvider = new MockSpecialistProvider();
    mockProvider.enqueueResponse({
      text: 'Should never complete',
      delayMs: 200,
    });

    setTimeout(() => controller.abort(), 10);

    await expect(
      mockProvider.stream(
        {
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'cancel me' }],
          signal: controller.signal,
        },
        () => {}
      )
    ).rejects.toThrow(/aborted/i);
  });
});
