import {
  ModelProvider,
  ProviderType,
  ProviderHealthCheckResult,
  ProviderModelInfo,
} from '../model-provider.js';
import {
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmStreamChunk,
} from '../types.js';
import { OpenAiCompatibleProvider } from '../openai-compatible-provider.js';
import { validateLlmBaseUrl, redactSensitiveText } from '../../../utils/security.js';

export interface CustomProviderOptions {
  baseUrl: string;
  model?: string;
  apiKeyEnvVar?: string;
  timeoutMs?: number;
}

export class CustomModelProvider implements ModelProvider {
  readonly name = 'custom';
  readonly providerType: ProviderType = 'custom';
  readonly endpoint: string;
  readonly defaultModel: string;

  private readonly client: OpenAiCompatibleProvider;

  constructor(options: CustomProviderOptions) {
    const validation = validateLlmBaseUrl(options.baseUrl);
    if (!validation.isValid || !validation.normalizedUrl) {
      throw new Error(`Insecure or invalid provider endpoint: ${validation.error}`);
    }

    this.endpoint = validation.normalizedUrl;
    this.defaultModel = options.model || 'gpt-4o';
    const envVar = options.apiKeyEnvVar || 'CUSTOM_API_KEY';

    this.client = new OpenAiCompatibleProvider({
      baseUrl: this.endpoint,
      model: this.defaultModel,
      apiKeyEnvVar: envVar,
      timeoutMs: options.timeoutMs ?? 60000,
    });
  }

  async checkHealth(): Promise<ProviderHealthCheckResult> {
    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      // Probe /models endpoint if supported
      const res = await fetch(`${this.endpoint}/models`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      return {
        healthy: res.ok || res.status === 401, // 401 means endpoint exists and is reachable
        provider: 'custom',
        endpoint: this.endpoint,
        latencyMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        healthy: false,
        provider: 'custom',
        endpoint: this.endpoint,
        error: `Could not reach endpoint ${this.endpoint}: ${redactSensitiveText(msg)}`,
      };
    }
  }

  async listModels(): Promise<ProviderModelInfo[]> {
    return [
      { id: this.defaultModel, name: this.defaultModel, isFree: false },
    ];
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    return await this.client.complete(request);
  }

  async stream(
    request: LlmCompletionRequest,
    onChunk: (chunk: LlmStreamChunk) => void | Promise<void>
  ): Promise<LlmCompletionResult> {
    return await this.client.stream(request, onChunk);
  }
}
