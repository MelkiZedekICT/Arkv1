import { createHash } from 'node:crypto';

export interface RedactionResult<T> {
  redacted: T;
  quarantinedCount: number;
  typesDetected: string[];
}

function hashPrefix(secret: string): string {
  return createHash('sha256').update(secret).digest('hex').slice(0, 8);
}

/**
 * Deeply scans structured data (strings, objects, arrays) and replaces suspected secrets
 * with typed, tamper-evident markers: `[REDACTED:<type>:<hash-prefix>]`.
 */
export class StructuredSecretRedactor {
  private static readonly PATTERNS: Array<{ type: string; regex: RegExp }> = [
    {
      type: 'PEM_KEY',
      regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PRIVATE )?KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA |PRIVATE )?KEY-----/g,
    },
    {
      type: 'JWT',
      regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    },
    {
      type: 'CONNECTION_STRING',
      regex: /\b([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^:\s'"]+:)([^@\s'"]+)(@[^\s'"]+)/g,
    },
    {
      type: 'API_KEY_OPENAI',
      regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
    },
    {
      type: 'API_KEY_ANTHROPIC',
      regex: /\bant-[A-Za-z0-9_-]{20,}\b/g,
    },
    {
      type: 'API_KEY_GOOGLE',
      regex: /\bAIza[0-9A-Za-z-_]{35}\b/g,
    },
    {
      type: 'GITHUB_TOKEN',
      regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b/g,
    },
    {
      type: 'BEARER_TOKEN',
      regex: /Bearer\s+([A-Za-z0-9_.-]{16,})/gi,
    },
    {
      type: 'COOKIE_SESSION',
      regex: /(?:cookie|session|token|auth)=([A-Za-z0-9%_-]{24,})/gi,
    },
    {
      type: 'HIGH_ENTROPY_HEX',
      regex: /\b[a-f0-9]{40,64}\b/gi,
    },
  ];

  static redactString(text: string): { text: string; count: number; types: Set<string> } {
    if (!text || typeof text !== 'string') {
      return { text, count: 0, types: new Set() };
    }

    let sanitized = text;
    let count = 0;
    const types = new Set<string>();

    // 1. Connection strings with password
    sanitized = sanitized.replace(
      /\b([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^:\s'"]+:)([^@\s'"]+)(@[^\s'"]+)/g,
      (_match, proto, pass, host) => {
        count++;
        types.add('CONNECTION_CREDENTIALS');
        return `${proto}[REDACTED:PASSWORD:${hashPrefix(pass)}]${host}`;
      }
    );

    // 2. Bearer tokens
    sanitized = sanitized.replace(/Bearer\s+([A-Za-z0-9_.-]{16,})/gi, (_match, token) => {
      count++;
      types.add('BEARER_TOKEN');
      return `Bearer [REDACTED:BEARER:${hashPrefix(token)}]`;
    });

    // 3. Other patterns
    for (const { type, regex } of this.PATTERNS) {
      if (type === 'CONNECTION_STRING' || type === 'BEARER_TOKEN') continue;
      sanitized = sanitized.replace(regex, (match) => {
        count++;
        types.add(type);
        return `[REDACTED:${type}:${hashPrefix(match)}]`;
      });
    }

    return { text: sanitized, count, types };
  }

  static redactStructured<T>(data: T): RedactionResult<T> {
    let totalCount = 0;
    const typesFound = new Set<string>();

    function walk(val: unknown): unknown {
      if (val === null || val === undefined) {
        return val;
      }
      if (typeof val === 'string') {
        const res = StructuredSecretRedactor.redactString(val);
        totalCount += res.count;
        res.types.forEach((t) => typesFound.add(t));
        return res.text;
      }
      if (Array.isArray(val)) {
        return val.map(walk);
      }
      if (typeof val === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
          if (typeof v === 'string') {
            const strRes = StructuredSecretRedactor.redactString(v);
            if (strRes.count > 0) {
              totalCount += strRes.count;
              strRes.types.forEach((t) => typesFound.add(t));
              out[k] = strRes.text;
              continue;
            }

            // Fallback: Check sensitive keys if string didn't match a specific token format
            const lowerKey = k.toLowerCase();
            if (
              (lowerKey.includes('secret') ||
                lowerKey.includes('password') ||
                lowerKey.includes('apikey') ||
                lowerKey.includes('token')) &&
              v.trim().length > 0
            ) {
              totalCount++;
              typesFound.add('KEY_NAME_MATCH');
              out[k] = `[REDACTED:SECRET_FIELD:${hashPrefix(v)}]`;
              continue;
            }
          }
          out[k] = walk(v);
        }
        return out;
      }
      return val;
    }

    const redacted = walk(data) as T;
    return {
      redacted,
      quarantinedCount: totalCount,
      typesDetected: Array.from(typesFound),
    };
  }
}
