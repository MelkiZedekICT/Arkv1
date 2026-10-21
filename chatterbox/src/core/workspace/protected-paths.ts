import { basename } from 'path';

export const DEFAULT_PROTECTED_PATTERNS = [
  /^\.env(\..+)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /^id_rsa(\.pub)?$/i,
  /^id_ed25519(\.pub)?$/i,
  /^credentials\.json$/i,
  /^service-account.*\.json$/i,
  /^\.git$/i,
  /^node_modules$/i,
  /^dist$/i,
  /^build$/i,
  /^\.ssh$/i,
];

export const DEFAULT_PROTECTED_PATH_STRINGS = [
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
  'id_rsa',
  'id_ed25519',
  'credentials.json',
  'service-account*.json',
  '.git/',
  'node_modules/',
  'dist/',
  'build/',
];

/**
 * Checks if a given relative path or file name matches default or custom protected path patterns.
 */
export function isPathProtected(
  relativePath: string,
  customProtectedPatterns?: string[]
): boolean {
  if (!relativePath) return false;

  // Normalize path separators to forward slash
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = normalized.split('/').filter(Boolean);

  // Check custom user-defined protected globs/strings if provided
  if (customProtectedPatterns && customProtectedPatterns.length > 0) {
    for (const pattern of customProtectedPatterns) {
      const cleanPattern = pattern.replace(/\\/g, '/').replace(/\/+$/, '');
      if (normalized === cleanPattern || normalized.startsWith(cleanPattern + '/')) {
        return true;
      }
      const file = basename(normalized);
      if (cleanPattern.startsWith('*') && file.endsWith(cleanPattern.slice(1))) {
        return true;
      }
      if (cleanPattern.endsWith('*') && file.startsWith(cleanPattern.slice(0, -1))) {
        return true;
      }
      for (const seg of segments) {
        if (seg === cleanPattern) return true;
        if (cleanPattern.startsWith('*') && seg.endsWith(cleanPattern.slice(1))) return true;
        if (cleanPattern.endsWith('*') && seg.startsWith(cleanPattern.slice(0, -1))) return true;
      }
    }
  }

  // Check every path segment against protected directory/file patterns
  for (const seg of segments) {
    for (const pattern of DEFAULT_PROTECTED_PATTERNS) {
      if (pattern.test(seg)) {
        return true;
      }
    }
  }

  return false;
}
