import { ModelProvider, ProviderHealthCheckResult, ProviderType } from './model-provider.js';
import { MockModelProvider } from './providers/mock-provider.js';
import { OllamaModelProvider } from './providers/ollama-provider.js';
import { OpenRouterModelProvider } from './providers/openrouter-provider.js';
import { CustomModelProvider } from './providers/custom-provider.js';
import { OpenAiCompatibleProvider } from './openai-compatible-provider.js';
import { LlmConfig } from '../config/schema.js';
import { resolveApiKey } from '../config/credential-store.js';
import {
  getProviderDefinition,
  isValidProviderName,
  ProviderName,
} from '../config/provider-registry.js';

export class StandardOpenAiModelProvider extends OpenAiCompatibleProvider implements ModelProvider {
  readonly providerType: ProviderType;
  readonly endpoint: string;

  constructor(
    type: ProviderType,
    displayName: string,
    endpoint: string,
    defaultModel: string,
    apiKeyEnvVar: string,
    timeoutMs = 60000
  ) {
    super({
      baseUrl: endpoint,
      model: defaultModel,
      apiKeyEnvVar,
      timeoutMs,
    });
    this.providerType = type;
    this.endpoint = endpoint;
  }

  async checkHealth(): Promise<ProviderHealthCheckResult> {
    const startTime = Date.now();
    try {
      const apiKey = process.env[this.apiKeyEnvVar];
      if (!apiKey) {
        return {
          healthy: false,
          provider: this.providerType,
          endpoint: this.endpoint,
          error: `Missing API key in environment or credentials store.`,
        };
      }
      return {
        healthy: true,
        provider: this.providerType,
        endpoint: this.endpoint,
        latencyMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      return {
        healthy: false,
        provider: this.providerType,
        endpoint: this.endpoint,
        error: String(err),
      };
    }
  }
}

export function createModelProvider(config: LlmConfig, forceMock = false): ModelProvider {
  if (forceMock || config.provider === 'mock') {
    return new MockModelProvider();
  }

  if (config.provider === 'ollama') {
    return new OllamaModelProvider({
      baseUrl: config.baseUrl !== 'https://api.openai.com/v1' ? config.baseUrl : 'http://localhost:11434/v1',
      model: config.model !== 'gpt-4o' ? config.model : 'qwen2.5-coder:7b',
      timeoutMs: config.timeoutMs,
    });
  }

  if (config.provider === 'openrouter') {
    const key = resolveApiKey('openrouter', 'OPENROUTER_API_KEY');
    if (key) process.env.OPENROUTER_API_KEY = key;
    return new OpenRouterModelProvider({
      model: config.model !== 'gpt-4o' ? config.model : 'openrouter/free',
      timeoutMs: config.timeoutMs,
    });
  }

  if (config.provider === 'custom') {
    return new CustomModelProvider({
      baseUrl: config.baseUrl,
      model: config.model,
      apiKeyEnvVar: config.apiKeyEnvVar,
      timeoutMs: config.timeoutMs,
    });
  }

  // Handle standard named BYOK providers: openai, anthropic, google-gemini, groq
  const pName = config.provider as ProviderName;
  if (isValidProviderName(pName)) {
    const def = getProviderDefinition(pName);
    const resolvedKey = resolveApiKey(pName, def.apiKeyEnvVar);
    if (resolvedKey) {
      process.env[def.apiKeyEnvVar] = resolvedKey;
    }

    const endpoint = config.baseUrl !== 'https://api.openai.com/v1' ? config.baseUrl : def.baseUrl;
    const model = config.model !== 'gpt-4o' ? config.model : def.defaultModel;

    return new StandardOpenAiModelProvider(
      pName as ProviderType,
      def.displayName,
      endpoint,
      model,
      def.apiKeyEnvVar,
      config.timeoutMs
    );
  }

  // Fallback to OpenAI compatible
  return new StandardOpenAiModelProvider(
    'openai-compatible',
    'OpenAI Compatible',
    config.baseUrl,
    config.model,
    config.apiKeyEnvVar,
    config.timeoutMs
  );
}
