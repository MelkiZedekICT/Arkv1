import { LlmProvider } from './types.js';
import { LlmConfig } from '../config/schema.js';
import { MockPlannerProvider } from './mock-planner-provider.js';
import { OpenAiCompatibleProvider } from './openai-compatible-provider.js';

export * from './types.js';
export * from './mock-planner-provider.js';
export * from './openai-compatible-provider.js';

export function createLlmProvider(config: LlmConfig, forceMock = false): LlmProvider {
  if (forceMock || config.provider === 'mock') {
    return new MockPlannerProvider();
  }

  if (config.provider === 'openai-compatible') {
    return new OpenAiCompatibleProvider({
      baseUrl: config.baseUrl,
      model: config.model,
      apiKeyEnvVar: config.apiKeyEnvVar,
      timeoutMs: config.timeoutMs,
      maxRetries: config.maxRetries,
    });
  }

  // Fallback to mock provider
  return new MockPlannerProvider();
}
