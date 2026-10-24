/**
 * RFC 8785 Canonical JSON representation.
 * Produces deterministic, byte-for-byte identical JSON serialization for cryptographic hashing.
 */
export function canonicalizeJson(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return 'null';
  }

  if (typeof obj === 'boolean' || typeof obj === 'number') {
    return JSON.stringify(obj);
  }

  if (typeof obj === 'string') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    const items = obj.map((item) => canonicalizeJson(item));
    return `[${items.join(',')}]`;
  }

  if (typeof obj === 'object') {
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    const pairs: string[] = [];
    for (const key of keys) {
      const val = (obj as Record<string, unknown>)[key];
      if (val !== undefined && typeof val !== 'function' && typeof val !== 'symbol') {
        pairs.push(`${JSON.stringify(key)}:${canonicalizeJson(val)}`);
      }
    }
    return `{${pairs.join(',')}}`;
  }

  return 'null';
}
