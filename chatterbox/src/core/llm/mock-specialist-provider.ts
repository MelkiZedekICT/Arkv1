import {
  StreamingLlmProvider,
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmStreamChunk,
} from './types.js';

export interface MockResponseConfig {
  text?: string;
  error?: Error;
  delayMs?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export class MockSpecialistProvider implements StreamingLlmProvider {
  readonly name = 'mock-specialist-provider';
  private responseQueue: MockResponseConfig[] = [];
  private defaultResponse: string;
  public completedRequests: LlmCompletionRequest[] = [];

  constructor(defaultResponse = '{}') {
    this.defaultResponse = defaultResponse;
  }

  enqueueResponse(config: MockResponseConfig): void {
    this.responseQueue.push(config);
  }

  setDefaultResponse(response: string): void {
    this.defaultResponse = response;
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    this.completedRequests.push(request);

    if (request.signal?.aborted) {
      throw new Error('LLM request aborted by signal');
    }

    const config = this.responseQueue.shift();
    if (config?.delayMs) {
      await new Promise((res) => setTimeout(res, config.delayMs));
    }

    if (config?.error) {
      throw config.error;
    }

    const text = config?.text ?? this.defaultResponse;
    const inputTokens = config?.inputTokens ?? Math.ceil(request.messages.reduce((a, m) => a + m.content.length, 0) / 4);
    const outputTokens = config?.outputTokens ?? Math.max(1, Math.ceil(text.length / 4));

    return {
      text,
      usage: {
        inputTokens,
        outputTokens,
        estimatedCostUsd: (inputTokens * 2.5 + outputTokens * 10) / 1_000_000,
      },
      model: request.model || 'mock-model',
      provider: this.name,
      requestId: `mock_req_${Date.now()}`,
      latencyMs: config?.delayMs ?? 15,
    };
  }

  async stream(
    request: LlmCompletionRequest,
    onChunk: (chunk: LlmStreamChunk) => void | Promise<void>
  ): Promise<LlmCompletionResult> {
    this.completedRequests.push(request);

    if (request.signal?.aborted) {
      throw new Error('LLM request aborted by signal');
    }

    const config = this.responseQueue.shift();
    if (config?.delayMs) {
      await new Promise((res) => setTimeout(res, config.delayMs));
    }

    if (config?.error) {
      throw config.error;
    }

    const text = config?.text ?? this.defaultResponse;
    const inputTokens = config?.inputTokens ?? Math.ceil(request.messages.reduce((a, m) => a + m.content.length, 0) / 4);
    const outputTokens = config?.outputTokens ?? Math.max(1, Math.ceil(text.length / 4));

    // Emit words as progressive chunks
    const words = text.split(' ');
    for (let i = 0; i < words.length; i++) {
      if (request.signal?.aborted) {
        throw new Error('LLM request aborted by signal');
      }
      const isLast = i === words.length - 1;
      const wordText = words[i] + (isLast ? '' : ' ');
      await onChunk({
        text: wordText,
        finishReason: isLast ? 'stop' : undefined,
      });
    }

    return {
      text,
      usage: {
        inputTokens,
        outputTokens,
        estimatedCostUsd: (inputTokens * 2.5 + outputTokens * 10) / 1_000_000,
      },
      model: request.model || 'mock-model',
      provider: this.name,
      requestId: `mock_stream_req_${Date.now()}`,
      latencyMs: config?.delayMs ?? 20,
    };
  }
}
