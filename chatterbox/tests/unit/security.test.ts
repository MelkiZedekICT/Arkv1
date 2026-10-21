import { describe, it, expect } from 'vitest';
import {
  redactSensitiveText,
  validateLlmBaseUrl,
  sanitizeErrorMessage,
  sanitizeStackTrace,
} from '../../src/utils/security.js';

describe('Security & Redaction Utilities', () => {
  it('redacts explicit secret keys passed to it', () => {
    const secret = 'sk-proj-abc123xyz789SECRETKEY000';
    const message = `API request to https://api.openai.com failed with authorization header using ${secret}!`;
    const redacted = redactSensitiveText(message, [secret]);

    expect(redacted).not.toContain(secret);
    expect(redacted).toContain('[REDACTED_SECRET]');
  });

  it('redacts Bearer tokens automatically', () => {
    const raw = 'Header Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz';
    const redacted = redactSensitiveText(raw);

    expect(redacted).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz');
    expect(redacted).toContain('Bearer [REDACTED]');
  });

  it('redacts OpenAI sk-... style keys automatically', () => {
    const raw = 'Failed to connect using sk-1234567890abcdef1234567890abcdef';
    const redacted = redactSensitiveText(raw);

    expect(redacted).not.toContain('sk-1234567890abcdef1234567890abcdef');
    expect(redacted).toContain('[REDACTED_API_KEY]');
  });

  it('redacts query parameter tokens', () => {
    const raw = 'GET https://custom-gateway.io/v1/chat?api_key=mySuperSecretKey123&other=val';
    const redacted = redactSensitiveText(raw);

    expect(redacted).not.toContain('mySuperSecretKey123');
    expect(redacted).toContain('api_key=[REDACTED]');
  });

  it('validates and normalizes safe LLM base URLs', () => {
    const validHttps = validateLlmBaseUrl('https://api.openai.com/v1/');
    expect(validHttps.isValid).toBe(true);
    expect(validHttps.normalizedUrl).toBe('https://api.openai.com/v1');

    const validLocalhost = validateLlmBaseUrl('http://localhost:11434/v1');
    expect(validLocalhost.isValid).toBe(true);

    const valid127 = validateLlmBaseUrl('http://127.0.0.1:8000/v1');
    expect(valid127.isValid).toBe(true);
  });

  it('rejects unsafe protocols and remote unencrypted HTTP', () => {
    const fileUrl = validateLlmBaseUrl('file:///etc/passwd');
    expect(fileUrl.isValid).toBe(false);

    const remoteHttp = validateLlmBaseUrl('http://external-api.evil.com/v1');
    expect(remoteHttp.isValid).toBe(false);
    expect(remoteHttp.error).toContain('Insecure HTTP protocol');
  });

  it('sanitizes error messages to prevent exposing source code and code frames', () => {
    const codeSnippetError = new Error(
      'Execution failed at runtime:\n```typescript\nconst apiSecret = "super-secret-pass";\nexecute(apiSecret);\n```\n> 45 | const apiSecret = "super-secret-pass";\n     | ^^^^^^^^^^^^^^^^^'
    );
    const sanitized = sanitizeErrorMessage(codeSnippetError);

    expect(sanitized).not.toContain('super-secret-pass');
    expect(sanitized).not.toContain('execute(apiSecret)');
    expect(sanitized).not.toContain('const apiSecret');
    expect(sanitized).toContain('[CODE_SNIPPET_REDACTED]');
    expect(sanitized).toContain('[SOURCE_LINE_REDACTED]');
  });

  it('sanitizes stack traces keeping frame locations while purging source code lines', () => {
    const rawStack = `Error: Something blew up
> 14 |   const password = 'leakedPassword123';
     |   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    at runProcess (C:\\app\\src\\core\\engine\\scheduler.ts:45:10)
    at eval at <anonymous> (C:\\app\\src\\core\\tools.ts:12:3), <anonymous>:1:5
    at processTicksAndRejections (node:internal/process/task_queues:104:5)`;

    const sanitizedStack = sanitizeStackTrace(rawStack);

    expect(sanitizedStack).not.toContain('leakedPassword123');
    expect(sanitizedStack).not.toContain('const password');
    expect(sanitizedStack).not.toContain('^^^^^');
    expect(sanitizedStack).toContain('at runProcess');
    expect(sanitizedStack).toContain('at processTicksAndRejections');
    expect(sanitizedStack).not.toContain('eval at');
  });
});
