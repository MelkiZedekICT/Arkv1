export type LlmRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LlmMessage {
  role: LlmRole;
  content: string;
}

export interface LlmCompletionRequest {
  model: string;
  messages: LlmMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  responseFormat?: 'text' | 'json';
  signal?: AbortSignal;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd?: number;
}

export interface LlmCompletionResult {
  text: string;
  usage: LlmUsage;
  model: string;
  provider: string;
  requestId?: string;
  latencyMs: number;
}

export interface LlmProvider {
  readonly name: string;
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResult>;
}

export type LlmStreamChunk = {
  text?: string;
  usage?: LlmUsage;
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'error';
};

export interface StreamingLlmProvider extends LlmProvider {
  stream(
    request: LlmCompletionRequest,
    onChunk: (chunk: LlmStreamChunk) => void | Promise<void>
  ): Promise<LlmCompletionResult>;
}
