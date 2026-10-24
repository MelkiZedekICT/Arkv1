import {
  ModelProvider,
  ProviderType,
  ProviderHealthCheckResult,
  ProviderModelInfo,
  ProviderRateLimitError,
  ProviderQuotaError,
} from '../model-provider.js';
import {
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmStreamChunk,
} from '../types.js';
import { OpenAiCompatibleProvider } from '../openai-compatible-provider.js';
import { redactSensitiveText } from '../../../utils/security.js';

export interface OpenRouterProviderOptions {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
}

export class OpenRouterModelProvider implements ModelProvider {
  readonly name = 'openrouter';
  readonly providerType: ProviderType = 'openrouter';
  readonly endpoint = 'https://openrouter.ai/api/v1';
  readonly defaultModel: string;

  private readonly client: OpenAiCompatibleProvider;

  constructor(options: OpenRouterProviderOptions = {}) {
    this.defaultModel = options.model || 'openrouter/free';
    if (options.apiKey) {
      process.env.OPENROUTER_API_KEY = options.apiKey;
    }

    this.client = new OpenAiCompatibleProvider({
      baseUrl: this.endpoint,
      model: this.defaultModel,
      apiKeyEnvVar: 'OPENROUTER_API_KEY',
      timeoutMs: options.timeoutMs ?? 60000,
    });
  }

  async checkHealth(): Promise<ProviderHealthCheckResult> {
    const startTime = Date.now();
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return {
        healthy: false,
        provider: 'openrouter',
        endpoint: this.endpoint,
        error: 'Missing OPENROUTER_API_KEY. Configure with "agentfeed provider set openrouter".',
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(`${this.endpoint}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.status === 401) {
        return {
          healthy: false,
          provider: 'openrouter',
          endpoint: this.endpoint,
          error: 'OpenRouter authentication failed: invalid API key.',
        };
      }

      if (res.status === 429) {
        return {
          healthy: false,
          provider: 'openrouter',
          endpoint: this.endpoint,
          error: 'OpenRouter rate limit reached. Consider switching to Ollama or Mock mode.',
        };
      }

      if (!res.ok) {
        return {
          healthy: false,
          provider: 'openrouter',
          endpoint: this.endpoint,
          error: `OpenRouter returned HTTP ${res.status}`,
        };
      }

      const data = (await res.json()) as { data?: Array<{ id: string; name?: string; context_length?: number }> };
      const availableModels: ProviderModelInfo[] = (data.data || [])
        .filter((m) => m.id.endsWith(':free') || m.id.includes('free') || m.id === 'openrouter/free')
        .slice(0, 10)
        .map((m) => ({
          id: m.id,
          name: m.name || m.id,
          contextWindow: m.context_length,
          isFree: true,
        }));

      return {
        healthy: true,
        provider: 'openrouter',
        endpoint: this.endpoint,
        latencyMs: Date.now() - startTime,
        availableModels,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        healthy: false,
        provider: 'openrouter',
        endpoint: this.endpoint,
        error: `OpenRouter health check failed: ${redactSensitiveText(msg)}`,
      };
    }
  }

  async listModels(): Promise<ProviderModelInfo[]> {
    return [
      { id: 'openrouter/free', name: 'OpenRouter Free (Auto-routed)', isFree: true },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (Free tier)', isFree: true },
      { id: 'qwen/qwen-2.5-coder-32b-instruct:free', name: 'Qwen 2.5 Coder 32B (Free tier)', isFree: true },
      { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash Exp (Free tier)', isFree: true },
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (BYOK)', isFree: false },
      { id: 'openai/gpt-4o', name: 'GPT-4o (BYOK)', isFree: false },
    ];
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    try {
      return await this.client.complete(request);
    } catch (err: unknown) {
      throw this.translateError(err);
    }
  }

  async stream(
    request: LlmCompletionRequest,
    onChunk: (chunk: LlmStreamChunk) => void | Promise<void>
  ): Promise<LlmCompletionResult> {
    try {
      return await this.client.stream(request, onChunk);
    } catch (err: unknown) {
      throw this.translateError(err);
    }
  }

  private translateError(err: unknown): Error {
    const raw = err instanceof Error ? err.message : String(err);
    const sanitized = redactSensitiveText(raw);

    if (sanitized.includes('429') || sanitized.toLowerCase().includes('rate limit')) {
      return new ProviderRateLimitError(
        'openrouter',
        `OpenRouter rate limit exceeded. Free tier models are heavily throttled. Tip: Fall back to local Ollama or run with '--mock' for instant offline execution.`
      );
    }

    if (sanitized.includes('402') || sanitized.toLowerCase().includes('credit') || sanitized.toLowerCase().includes('quota')) {
      return new ProviderQuotaError(
        'openrouter',
        `OpenRouter credit quota exhausted. Add credits at openrouter.ai or use free models (:free) / mock mode ('--mock').`
      );
    }

    return new Error(sanitized);
  }
}
