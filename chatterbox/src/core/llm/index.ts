import { LlmProvider } from './types.js';
import { LlmConfig } from '../config/schema.js';
import { createModelProvider } from './provider-factory.js';

export * from './types.js';
export * from './model-provider.js';
export * from './provider-factory.js';
export * from './mock-planner-provider.js';
export * from './mock-specialist-provider.js';
export * from './openai-compatible-provider.js';
export * from './providers/mock-provider.js';
export * from './providers/ollama-provider.js';
export * from './providers/openrouter-provider.js';
export * from './providers/custom-provider.js';

/**
 * Backwards-compatible factory for creating an LLM provider.
 * Uses the enhanced ModelProvider under the hood.
 */
export function createLlmProvider(config: LlmConfig, forceMock = false): LlmProvider {
  return createModelProvider(config, forceMock);
}
