import {
  ModelProvider,
  ProviderType,
  ProviderHealthCheckResult,
  ProviderModelInfo,
  ProviderConnectionError,
} from '../model-provider.js';
import {
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmStreamChunk,
} from '../types.js';
import { OpenAiCompatibleProvider } from '../openai-compatible-provider.js';

export interface OllamaProviderOptions {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

export class OllamaModelProvider implements ModelProvider {
  readonly name = 'ollama';
  readonly providerType: ProviderType = 'ollama';
  readonly endpoint: string;
  readonly defaultModel: string;

  private readonly client: OpenAiCompatibleProvider;

  constructor(options: OllamaProviderOptions = {}) {
    const rawBase = (options.baseUrl || 'http://localhost:11434/v1').replace(/\/+$/, '');
    this.endpoint = rawBase;
    this.defaultModel = options.model || 'qwen2.5-coder:7b';

    // Set fallback dummy key if not present, since Ollama doesn't require keys
    if (!process.env.OLLAMA_API_KEY) {
      process.env.OLLAMA_API_KEY = 'ollama-local-key';
    }

    this.client = new OpenAiCompatibleProvider({
      baseUrl: this.endpoint,
      model: this.defaultModel,
      apiKeyEnvVar: 'OLLAMA_API_KEY',
      timeoutMs: options.timeoutMs ?? 60000,
    });
  }

  async checkHealth(): Promise<ProviderHealthCheckResult> {
    const startTime = Date.now();
    try {
      // Query Ollama's native tag API to verify service is running and retrieve installed models
      const nativeTagsUrl = this.endpoint.replace(/\/v1\/?$/, '') + '/api/tags';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(nativeTagsUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        return {
          healthy: false,
          provider: 'ollama',
          endpoint: this.endpoint,
          error: `Ollama returned HTTP ${res.status}. Is ollama running at ${this.endpoint}?`,
        };
      }

      const data = (await res.json()) as { models?: Array<{ name: string; size?: number }> };
      const availableModels: ProviderModelInfo[] = (data.models || []).map((m) => ({
        id: m.name,
        name: m.name,
        isFree: true,
        description: `Local model (${m.size ? Math.round(m.size / (1024 * 1024)) + 'MB' : 'local'})`,
      }));

      return {
        healthy: true,
        provider: 'ollama',
        endpoint: this.endpoint,
        latencyMs: Date.now() - startTime,
        availableModels,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        healthy: false,
        provider: 'ollama',
        endpoint: this.endpoint,
        error: `Ollama connection failed: ${msg}. Run "ollama serve" or switch to mock mode with --mock.`,
      };
    }
  }

  async listModels(): Promise<ProviderModelInfo[]> {
    const health = await this.checkHealth();
    if (health.healthy && health.availableModels && health.availableModels.length > 0) {
      return health.availableModels;
    }
    // Return sensible defaults if tags query unavailable
    return [
      { id: 'qwen2.5-coder:7b', name: 'qwen2.5-coder:7b', isFree: true },
      { id: 'llama3.1:8b', name: 'llama3.1:8b', isFree: true },
      { id: 'deepseek-coder-v2:16b', name: 'deepseek-coder-v2:16b', isFree: true },
      { id: 'codellama', name: 'codellama', isFree: true },
    ];
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    try {
      return await this.client.complete(request);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
        throw new ProviderConnectionError(
          'ollama',
          this.endpoint,
          `Ollama is not running at ${this.endpoint}. Start Ollama with 'ollama serve' or run Chatterbox in mock mode with '--mock'.`
        );
      }
      throw err;
    }
  }

  async stream(
    request: LlmCompletionRequest,
    onChunk: (chunk: LlmStreamChunk) => void | Promise<void>
  ): Promise<LlmCompletionResult> {
    try {
      return await this.client.stream(request, onChunk);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
        throw new ProviderConnectionError(
          'ollama',
          this.endpoint,
          `Ollama is not running at ${this.endpoint}. Start Ollama with 'ollama serve' or run Chatterbox in mock mode with '--mock'.`
        );
      }
      throw err;
    }
  }
}
