import {
  ModelProvider,
  ProviderType,
  ProviderHealthCheckResult,
  ProviderModelInfo,
} from '../model-provider.js';
import {
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmStreamChunk,
} from '../types.js';
import { MockPlannerProvider } from '../mock-planner-provider.js';

export class MockModelProvider implements ModelProvider {
  readonly name = 'mock';
  readonly providerType: ProviderType = 'mock';
  readonly endpoint = 'in-memory://chatterbox-mock';
  readonly defaultModel = 'mock-balanced';

  private readonly planner = new MockPlannerProvider();

  async checkHealth(): Promise<ProviderHealthCheckResult> {
    return {
      healthy: true,
      provider: 'mock',
      endpoint: this.endpoint,
      latencyMs: 1,
      availableModels: await this.listModels(),
    };
  }

  async listModels(): Promise<ProviderModelInfo[]> {
    return [
      { id: 'mock-balanced', name: 'Mock Balanced (Default)', isFree: true, description: 'Deterministic simulated agent team' },
      { id: 'mock-fast', name: 'Mock Fast', isFree: true, description: 'Simulated responses with zero delay' },
      { id: 'mock-deep', name: 'Mock Deep Reasoning', isFree: true, description: 'Simulated complex multi-agent debates' },
    ];
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResult> {
    const startTime = Date.now();
    const isPlan = request.messages.some((m) =>
      m.content.toLowerCase().includes('plan') || m.content.toLowerCase().includes('task') || m.content.toLowerCase().includes('goal')
    );

    let text: string;
    if (request.responseFormat === 'json') {
      // Return structured plan if JSON is requested
      const planRes = await this.planner.complete(request);
      text = planRes.text;
    } else if (isPlan) {
      const planRes = await this.planner.complete(request);
      text = planRes.text;
    } else {
      text = `Simulated agent response for prompt:\n${request.messages[request.messages.length - 1]?.content || ''}`;
    }

    const inputTokens = Math.ceil(request.messages.reduce((a, m) => a + m.content.length, 0) / 4);
    const outputTokens = Math.max(1, Math.ceil(text.length / 4));

    return {
      text,
      usage: {
        inputTokens,
        outputTokens,
        estimatedCostUsd: 0,
      },
      model: request.model || this.defaultModel,
      provider: this.name,
      latencyMs: Date.now() - startTime,
    };
  }

  async stream(
    request: LlmCompletionRequest,
    onChunk: (chunk: LlmStreamChunk) => void | Promise<void>
  ): Promise<LlmCompletionResult> {
    const result = await this.complete(request);
    const words = result.text.split(' ');
    for (let i = 0; i < words.length; i++) {
      const delta = (i === 0 ? '' : ' ') + words[i];
      await onChunk({
        text: delta,
        finishReason: i === words.length - 1 ? 'stop' : undefined,
      });
    }
    return result;
  }
}
