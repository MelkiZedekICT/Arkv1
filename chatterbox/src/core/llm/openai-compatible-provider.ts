import {
  LlmProvider,
  StreamingLlmProvider,
  LlmStreamChunk,
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmUsage,
} from './types.js';
import { redactSensitiveText, validateLlmBaseUrl } from '../../utils/security.js';

export interface OpenAiCompatibleOptions {
  baseUrl?: string;
  model?: string;
  apiKeyEnvVar?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export function isStreamingLlmProvider(provider: LlmProvider): provider is StreamingLlmProvider {
  return typeof (provider as StreamingLlmProvider).stream === 'function';
}

export function asStreamingLlmProvider(provider: LlmProvider): StreamingLlmProvider {
  if (isStreamingLlmProvider(provider)) {
    return provider;
  }
  return {
    name: provider.name,
    complete: (req) => provider.complete(req),
    stream: async (req, onChunk) => {
      const result = await provider.complete(req);
      await onChunk({
        text: result.text,
        usage: result.usage,
        finishReason: 'stop',
      });
      return result;
    },
  };
}

export class OpenAiCompatibleProvider implements StreamingLlmProvider {
  readonly name = 'openai-compatible';
  readonly baseUrl: string;
  readonly defaultModel: string;
  readonly apiKeyEnvVar: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;

  constructor(options: OpenAiCompatibleOptions = {}) {
    const rawUrl = options.baseUrl || 'https://api.openai.com/v1';
    const validation = validateLlmBaseUrl(rawUrl);
    if (!validation.isValid || !validation.normalizedUrl) {
      throw new Error(`Invalid LLM baseUrl: ${validation.error}`);
    }
    this.baseUrl = validation.normalizedUrl;
    this.defaultModel = options.model || 'gpt-4o';
    this.apiKeyEnvVar = options.apiKeyEnvVar || 'OPENAI_API_KEY';
    this.timeoutMs = options.timeoutMs ?? 60000;
    this.maxRetries = options.maxRetries ?? 2;
  }

  private getApiKey(): string {
    const key = process.env[this.apiKeyEnvVar];
    if (!key || key.trim().length === 0) {
      throw new Error(
        `Missing ${this.apiKeyEnvVar}. Set it in your environment before running Chatterbox/AgentFeed.`
      );
    }
    return key.trim();
  }

  private estimateCost(model: string, inputTokens: number, outputTokens: number): number {
    const isMini = model.toLowerCase().includes('mini');
    const inputRatePerMillion = isMini ? 0.15 : 2.5;
    const outputRatePerMillion = isMini ? 0.6 : 10.0;

    const cost =
      (inputTokens / 1_000_000) * inputRatePerMillion +
      (outputTokens / 1_000_000) * outputRatePerMillion;
    return Math.round(cost * 100_000) / 100_000;
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const apiKey = this.getApiKey();
    const model = request.model || this.defaultModel;
    const url = `${this.baseUrl}/chat/completions`;

    const payload: Record<string, unknown> = {
      model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: request.temperature ?? 0.2,
    };

    if (request.maxOutputTokens) {
      payload.max_tokens = request.maxOutputTokens;
    }

    if (request.responseFormat === 'json') {
      payload.response_format = { type: 'json_object' };
    }

    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      attempt++;
      const startTime = Date.now();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      if (request.signal) {
        request.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const status = response.status;
          let errorDetails = `HTTP ${status}`;
          try {
            const errBody = (await response.json()) as { error?: { message?: string } };
            if (errBody?.error?.message) {
              errorDetails = `${errorDetails}: ${errBody.error.message}`;
            }
          } catch {
            // Non-JSON response
          }

          const isRetryable = status === 429 || (status >= 500 && status < 600);
          if (isRetryable && attempt <= this.maxRetries) {
            const backoffMs = Math.min(4000, 500 * Math.pow(2, attempt - 1)) + Math.random() * 200;
            await new Promise((res) => setTimeout(res, backoffMs));
            continue;
          }

          throw new Error(`LLM API request failed (${errorDetails})`);
        }

        const data = (await response.json()) as {
          id?: string;
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };

        const choice = data.choices?.[0];
        const content = choice?.message?.content || '';
        const inputTokens = data.usage?.prompt_tokens ?? 0;
        const outputTokens = data.usage?.completion_tokens ?? 0;
        const latencyMs = Date.now() - startTime;

        return {
          text: content,
          usage: {
            inputTokens,
            outputTokens,
            estimatedCostUsd: this.estimateCost(model, inputTokens, outputTokens),
          },
          model,
          provider: this.name,
          requestId: data.id,
          latencyMs,
        };
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        const isAbort = err instanceof Error && (err.name === 'AbortError' || controller.signal.aborted);
        const msg = isAbort
          ? `LLM request timed out after ${this.timeoutMs}ms`
          : err instanceof Error
          ? err.message
          : String(err);

        const sanitizedMsg = redactSensitiveText(msg, [apiKey]);
        lastError = new Error(sanitizedMsg);

        if (attempt <= this.maxRetries && !isAbort) {
          const backoffMs = 500 * Math.pow(2, attempt - 1);
          await new Promise((res) => setTimeout(res, backoffMs));
          continue;
        }
        break;
      }
    }

    throw lastError || new Error('LLM completion failed after retries.');
  }

  async stream(
    request: LlmCompletionRequest,
    onChunk: (chunk: LlmStreamChunk) => void | Promise<void>
  ): Promise<LlmCompletionResult> {
    const apiKey = this.getApiKey();
    const model = request.model || this.defaultModel;
    const url = `${this.baseUrl}/chat/completions`;

    const payload: Record<string, unknown> = {
      model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: request.temperature ?? 0.2,
      stream: true,
      stream_options: { include_usage: true },
    };

    if (request.maxOutputTokens) {
      payload.max_tokens = request.maxOutputTokens;
    }

    if (request.responseFormat === 'json') {
      payload.response_format = { type: 'json_object' };
    }

    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      attempt++;
      const startTime = Date.now();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      if (request.signal) {
        request.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const status = response.status;
          let errorDetails = `HTTP ${status}`;
          try {
            const errBody = (await response.json()) as { error?: { message?: string } };
            if (errBody?.error?.message) {
              errorDetails = `${errorDetails}: ${errBody.error.message}`;
            }
          } catch {
            // Non-JSON response
          }

          const isRetryable = status === 429 || (status >= 500 && status < 600);
          if (isRetryable && attempt <= this.maxRetries) {
            const backoffMs = Math.min(4000, 500 * Math.pow(2, attempt - 1)) + Math.random() * 200;
            await new Promise((res) => setTimeout(res, backoffMs));
            continue;
          }

          throw new Error(`LLM API request failed (${errorDetails})`);
        }

        if (!response.body) {
          throw new Error('LLM streaming failed: response body is null');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';
        let lastReportedUsage: LlmUsage | undefined;
        let requestId: string | undefined;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue; // Comment/ping

            if (trimmed === 'data: [DONE]') {
              continue;
            }

            if (trimmed.startsWith('data: ')) {
              const jsonStr = trimmed.slice(6);
              try {
                const chunkData = JSON.parse(jsonStr) as {
                  id?: string;
                  choices?: Array<{
                    delta?: { content?: string };
                    text?: string;
                    finish_reason?: 'stop' | 'length' | 'tool_calls' | 'error';
                  }>;
                  usage?: { prompt_tokens?: number; completion_tokens?: number };
                };

                if (chunkData.id) requestId = chunkData.id;

                const choice = chunkData.choices?.[0];
                const deltaText = choice?.delta?.content ?? choice?.text ?? '';
                const finishReason = choice?.finish_reason;

                if (chunkData.usage) {
                  const inTok = chunkData.usage.prompt_tokens ?? 0;
                  const outTok = chunkData.usage.completion_tokens ?? 0;
                  lastReportedUsage = {
                    inputTokens: inTok,
                    outputTokens: outTok,
                    estimatedCostUsd: this.estimateCost(model, inTok, outTok),
                  };
                }

                if (deltaText || finishReason || lastReportedUsage) {
                  fullText += deltaText;
                  await onChunk({
                    text: deltaText || undefined,
                    usage: lastReportedUsage,
                    finishReason: finishReason ?? undefined,
                  });
                }
              } catch {
                // Ignore chunk parse errors in SSE stream
              }
            }
          }
        }

        const latencyMs = Date.now() - startTime;

        // Fallback token calculation if stream didn't provide usage
        let finalUsage = lastReportedUsage;
        if (!finalUsage) {
          const approxInput = Math.ceil(
            request.messages.reduce((acc, m) => acc + m.content.length, 0) / 4
          );
          const approxOutput = Math.max(1, Math.ceil(fullText.length / 4));
          finalUsage = {
            inputTokens: approxInput,
            outputTokens: approxOutput,
            estimatedCostUsd: this.estimateCost(model, approxInput, approxOutput),
          };
        }

        return {
          text: fullText,
          usage: finalUsage,
          model,
          provider: this.name,
          requestId,
          latencyMs,
        };
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        const isAbort = err instanceof Error && (err.name === 'AbortError' || controller.signal.aborted);
        const msg = isAbort
          ? `LLM request timed out after ${this.timeoutMs}ms`
          : err instanceof Error
          ? err.message
          : String(err);

        const sanitizedMsg = redactSensitiveText(msg, [apiKey]);
        lastError = new Error(sanitizedMsg);

        if (attempt <= this.maxRetries && !isAbort) {
          const backoffMs = 500 * Math.pow(2, attempt - 1);
          await new Promise((res) => setTimeout(res, backoffMs));
          continue;
        }
        break;
      }
    }

    throw lastError || new Error('LLM streaming failed after retries.');
  }
}

