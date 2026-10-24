import { z } from 'zod';

export const ProviderNameSchema = z.enum([
  'openai',
  'anthropic',
  'google-gemini',
  'openrouter',
  'groq',
  'ollama',
  'custom',
  'mock',
]);

export type ProviderNameEnum = z.infer<typeof ProviderNameSchema>;

export const LlmConfigSchema = z.object({
  provider: z.enum(['mock', 'openai-compatible', 'openai', 'anthropic', 'google-gemini', 'openrouter', 'groq', 'ollama', 'custom']).default('mock'),
  model: z.string().default('gpt-4o'),
  baseUrl: z.string().default('https://api.openai.com/v1'),
  apiKeyEnvVar: z.string().default('OPENAI_API_KEY'),
  temperature: z.number().default(0.2),
  maxOutputTokens: z.number().default(4096),
  timeoutMs: z.number().default(60000),
  maxRetries: z.number().default(2),
});

export type LlmConfig = z.infer<typeof LlmConfigSchema>;

export const ConfigSchema = z.object({
  modelProvider: ProviderNameSchema.default('mock'),
  model: z.string().default('gpt-4o'),
  storageDir: z.string().default('.chatterbox'),
  verbose: z.boolean().default(false),
  llm: LlmConfigSchema.default(() => LlmConfigSchema.parse({})),
});

export type Config = z.infer<typeof ConfigSchema>;
