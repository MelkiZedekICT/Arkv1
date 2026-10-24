/**
 * Named provider definitions with defaults (base URLs, env vars, popular models).
 * Each named provider maps to an openai-compatible provider with the correct configuration.
 */

export interface ProviderDefinition {
  readonly id: ProviderName;
  readonly displayName: string;
  readonly baseUrl: string;
  readonly apiKeyEnvVar: string;
  readonly defaultModel: string;
  readonly popularModels: readonly string[];
  readonly supportsModelListing: boolean;
  readonly requiresApiKey: boolean;
  readonly description: string;
}

export type ProviderName =
  | 'openai'
  | 'anthropic'
  | 'google-gemini'
  | 'openrouter'
  | 'groq'
  | 'ollama'
  | 'custom';

export const PROVIDER_DEFINITIONS: Record<ProviderName, ProviderDefinition> = {
  openai: {
    id: 'openai',
    displayName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4.1-mini',
    popularModels: ['gpt-4.1-mini', 'gpt-4.1', 'o4-mini', 'gpt-4o', 'gpt-4o-mini'],
    supportsModelListing: true,
    requiresApiKey: true,
    description: 'OpenAI API (GPT-4, GPT-4o, o-series)',
  },
  anthropic: {
    id: 'anthropic',
    displayName: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-sonnet-4-20250514',
    popularModels: [
      'claude-sonnet-4-20250514',
      'claude-opus-4-20250514',
      'claude-3-5-haiku-20241022',
    ],
    supportsModelListing: false,
    requiresApiKey: true,
    description: 'Anthropic API (Claude Sonnet, Opus, Haiku)',
  },
  'google-gemini': {
    id: 'google-gemini',
    displayName: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKeyEnvVar: 'GEMINI_API_KEY',
    defaultModel: 'gemini-2.5-flash',
    popularModels: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
    supportsModelListing: false,
    requiresApiKey: true,
    description: 'Google Gemini API (Gemini Pro, Flash)',
  },
  openrouter: {
    id: 'openrouter',
    displayName: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnvVar: 'OPENROUTER_API_KEY',
    defaultModel: 'openai/gpt-4o',
    popularModels: [
      'openai/gpt-4o',
      'anthropic/claude-sonnet-4',
      'google/gemini-2.5-flash',
      'meta-llama/llama-3.1-405b-instruct',
    ],
    supportsModelListing: true,
    requiresApiKey: true,
    description: 'OpenRouter (access 200+ models with one API key)',
  },
  groq: {
    id: 'groq',
    displayName: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeyEnvVar: 'GROQ_API_KEY',
    defaultModel: 'llama-3.3-70b-versatile',
    popularModels: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
    supportsModelListing: true,
    requiresApiKey: true,
    description: 'Groq (ultra-fast inference for open-source models)',
  },
  ollama: {
    id: 'ollama',
    displayName: 'Ollama / Local',
    baseUrl: 'http://localhost:11434/v1',
    apiKeyEnvVar: 'OLLAMA_API_KEY',
    defaultModel: 'llama3',
    popularModels: ['llama3', 'codellama', 'mistral', 'deepseek-coder-v2'],
    supportsModelListing: true,
    requiresApiKey: false,
    description: 'Ollama or any local OpenAI-compatible endpoint',
  },
  custom: {
    id: 'custom',
    displayName: 'Custom OpenAI-compatible',
    baseUrl: '',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o',
    popularModels: [],
    supportsModelListing: true,
    requiresApiKey: true,
    description: 'Any OpenAI-compatible API endpoint',
  },
} as const;

/**
 * Ordered list of providers for display in the setup wizard.
 */
export const PROVIDER_DISPLAY_ORDER: readonly ProviderName[] = [
  'openai',
  'anthropic',
  'google-gemini',
  'openrouter',
  'groq',
  'ollama',
  'custom',
] as const;

/**
 * Get a provider definition by name.
 */
export function getProviderDefinition(name: ProviderName): ProviderDefinition {
  return PROVIDER_DEFINITIONS[name];
}

/**
 * Check if a provider name is valid.
 */
export function isValidProviderName(name: string): name is ProviderName {
  return name in PROVIDER_DEFINITIONS;
}

/**
 * Mask an API key for display, showing only the first 3 and last 4 characters.
 */
export function maskApiKey(key: string): string {
  if (!key || key.length < 8) {
    return '••••••••';
  }
  const prefix = key.slice(0, 3);
  const suffix = key.slice(-4);
  return `${prefix}${'•'.repeat(Math.min(key.length - 7, 20))}${suffix}`;
}
