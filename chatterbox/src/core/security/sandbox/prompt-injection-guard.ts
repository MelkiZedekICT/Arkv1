import { createHash } from 'node:crypto';

export interface UntrustedContentBlock {
  contentId: string;
  source: string;
  sanitizedText: string;
  suspectedInjection: boolean;
  injectionWarnings?: string[];
}

const INJECTION_PATTERNS = [
  /(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions|prompts|rules)/i,
  /system\s*override/i,
  /<\s*\/?\s*(?:system|admin|root|instruction)\s*>/i,
  /(?:output|print|reveal|exfiltrate|send)\s+(?:the\s+)?(?:api[_-]?key|secret|token|password|credential)/i,
  /you\s+are\s+now\s+in\s+unrestricted\s+mode/i,
  /roleplay\s+as\s+(?:an?\s+)?evil/i,
];

export class PromptInjectionGuard {
  /**
   * Scans untrusted text (repo files, tool outputs, user inputs) for injection signatures.
   */
  static scanForInjection(text: string): { isSuspected: boolean; warnings: string[] } {
    if (!text || typeof text !== 'string') {
      return { isSuspected: false, warnings: [] };
    }

    const warnings: string[] = [];
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(text)) {
        warnings.push(`Matched suspicious instruction pattern: "${pattern.source}"`);
      }
    }

    return {
      isSuspected: warnings.length > 0,
      warnings,
    };
  }

  /**
   * Wraps untrusted content into a demarcated data block with a stable content ID.
   * This isolates instructions from repository data at the protocol level.
   */
  static wrapUntrustedContent(source: string, rawContent: string): UntrustedContentBlock {
    const contentId = `content_${createHash('sha256').update(source + ':' + rawContent).digest('hex').slice(0, 12)}`;
    const scan = this.scanForInjection(rawContent);

    // Escape any artificial fake tags inside raw content
    const sanitized = rawContent
      .replace(/<\/?(?:system|instruction|admin)>/gi, '[ESCAPED_TAG]');

    return {
      contentId,
      source,
      sanitizedText: sanitized,
      suspectedInjection: scan.isSuspected,
      injectionWarnings: scan.warnings.length > 0 ? scan.warnings : undefined,
    };
  }
}
