import { StreamingLlmProvider } from './types.js';

export type ProviderType =
  | 'mock'
  | 'ollama'
  | 'openrouter'
  | 'openai'
  | 'anthropic'
  | 'google-gemini'
  | 'custom'
  | 'openai-compatible';

export interface ProviderModelInfo {
  readonly id: string;
  readonly name: string;
  readonly contextWindow?: number;
  readonly isFree?: boolean;
  readonly description?: string;
}

export interface ProviderHealthCheckResult {
  readonly healthy: boolean;
  readonly provider: ProviderType;
  readonly endpoint: string;
  readonly latencyMs?: number;
  readonly error?: string;
  readonly availableModels?: ProviderModelInfo[];
}

export interface ModelProvider extends StreamingLlmProvider {
  readonly providerType: ProviderType;
  readonly endpoint: string;
  readonly defaultModel: string;
  checkHealth(): Promise<ProviderHealthCheckResult>;
  listModels?(): Promise<ProviderModelInfo[]>;
}

export class ProviderError extends Error {
  readonly provider: ProviderType;
  readonly statusCode?: number;
  readonly isRetryable: boolean;

  constructor(
    message: string,
    options: { provider: ProviderType; statusCode?: number; isRetryable?: boolean }
  ) {
    super(message);
    this.name = 'ProviderError';
    this.provider = options.provider;
    this.statusCode = options.statusCode;
    this.isRetryable = options.isRetryable ?? false;
  }
}

export class ProviderRateLimitError extends ProviderError {
  constructor(provider: ProviderType, message = 'Rate limit exceeded (HTTP 429)') {
    super(message, { provider, statusCode: 429, isRetryable: true });
    this.name = 'ProviderRateLimitError';
  }
}

export class ProviderQuotaError extends ProviderError {
  constructor(provider: ProviderType, message = 'Credit or quota limit exceeded') {
    super(message, { provider, statusCode: 402, isRetryable: false });
    this.name = 'ProviderQuotaError';
  }
}

export class ProviderConnectionError extends ProviderError {
  constructor(provider: ProviderType, endpoint: string, message?: string) {
    super(
      message ||
        `Could not connect to ${provider} at ${endpoint}. Please verify the service is running.`,
      { provider, isRetryable: true }
    );
    this.name = 'ProviderConnectionError';
  }
}
