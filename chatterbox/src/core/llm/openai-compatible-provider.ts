import {
  LlmProvider,
  LlmCompletionRequest,
  LlmCompletionResult,
} from './types.js';
import { redactSensitiveText, validateLlmBaseUrl } from '../../utils/security.js';

export interface OpenAiCompatibleOptions {
  baseUrl?: string;
  model?: string;
  apiKeyEnvVar?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name = 'openai-compatible';
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly apiKeyEnvVar: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

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
    // Standard blended estimate: ~$2.50/M input, ~$10.00/M output for modern frontier models
    // gpt-4o-mini is ~$0.15 / ~$0.60 per M
    const isMini = model.toLowerCase().includes('mini');
    const inputRatePerMillion = isMini ? 0.15 : 2.5;
    const outputRatePerMillion = isMini ? 0.6 : 10.0;

    const cost = (inputTokens / 1_000_000) * inputRatePerMillion +
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

      // Setup abort controller with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      // Link external signal if provided
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

          // Check if retryable (429 rate limit or 5xx server error)
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

        // Sanitize error message to ensure no API key or token is ever present
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
}

