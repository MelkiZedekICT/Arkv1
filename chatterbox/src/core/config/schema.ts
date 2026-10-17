import { z } from 'zod';

export const ConfigSchema = z.object({
  modelProvider: z.enum(['openai', 'anthropic', 'openrouter', 'mock']).default('openai'),
  apiKey: z.string().default(''),
  model: z.string().default('gpt-4o'),
  storageDir: z.string().default('.chatterbox'),
  verbose: z.boolean().default(false),
});

export type Config = z.infer<typeof ConfigSchema>;
