/**
 * Security and sanitization utilities for Chatterbox / AgentFeed.
 * Ensures zero leakage of credentials, API keys, and sensitive tokens.
 */

const KNOWN_KEY_ENV_VARS = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'MISTRAL_API_KEY',
  'GROQ_API_KEY',
  'COHERE_API_KEY',
];

/**
 * Redacts known secrets and common sensitive key patterns from arbitrary strings or error messages.
 */
export function redactSensitiveText(
  text: string,
  extraSecrets: Array<string | undefined | null> = []
): string {
  if (!text || typeof text !== 'string') {
    return text;
  }

  let sanitized = text;

  // 1. Redact all known environment secrets if present in the current process
  const secretsToRedact = new Set<string>();
  for (const envVar of KNOWN_KEY_ENV_VARS) {
    const val = process.env[envVar];
    if (val && val.trim().length > 4) {
      secretsToRedact.add(val.trim());
    }
  }

  for (const secret of extraSecrets) {
    if (secret && secret.trim().length > 4) {
      secretsToRedact.add(secret.trim());
    }
  }

  for (const secret of secretsToRedact) {
    sanitized = sanitized.split(secret).join('[REDACTED_SECRET]');
  }

  // 2. Redact Bearer headers
  sanitized = sanitized.replace(/Bearer\s+[A-Za-z0-9_.-]+/gi, 'Bearer [REDACTED]');

  // 3. Redact common API key patterns (OpenAI sk-..., Anthropic ant-..., generic keys)
  sanitized = sanitized.replace(/sk-[A-Za-z0-9_-]{16,}/g, '[REDACTED_API_KEY]');
  sanitized = sanitized.replace(/ant-[A-Za-z0-9_-]{16,}/g, '[REDACTED_API_KEY]');

  // 4. Redact query param tokens
  sanitized = sanitized.replace(/([?&](?:api_key|apiKey|token|secret|password)=)[^&\s]+/gi, '$1[REDACTED]');

  return sanitized;
}

/**
 * Validates an LLM base URL to ensure safe protocols and reasonable hostnames.
 */
export function validateLlmBaseUrl(rawUrl: string): { isValid: boolean; normalizedUrl?: string; error?: string } {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        isValid: false,
        error: `Insecure or invalid protocol "${parsed.protocol}". Only "https:" (or "http:" for localhost) is supported.`,
      };
    }

    // If using http:, ensure it is localhost/127.0.0.1 (safe for local Ollama / vLLM)
    const hostname = parsed.hostname.toLowerCase();
    const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    if (parsed.protocol === 'http:' && !isLoopback) {
      return {
        isValid: false,
        error: `Insecure HTTP protocol used for non-local host "${hostname}". Please use "https:" for remote LLM providers.`,
      };
    }

    return {
      isValid: true,
      normalizedUrl: parsed.origin + parsed.pathname.replace(/\/+$/, ''),
    };
  } catch (err) {
    return {
      isValid: false,
      error: `Invalid URL format: ${(err as Error).message}`,
    };
  }
}
