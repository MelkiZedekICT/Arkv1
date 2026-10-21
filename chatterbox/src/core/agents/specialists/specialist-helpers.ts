import { LlmProvider, LlmCompletionRequest, LlmCompletionResult } from '../../llm/types.js';
import { asStreamingLlmProvider } from '../../llm/openai-compatible-provider.js';
import { EventBus } from '../../events/event-bus.js';
import { AgentFeedEvent, AgentFeedEventType } from '../../events/event-types.js';
import { Artifact } from '../../models/artifact.js';
import { ArtifactService } from '../../artifacts/artifact.service.js';
import { generateId } from '../../../utils/ids.js';
import { getTimestamp } from '../../../utils/time.js';

export interface EventPublisher {
  publish<T = Record<string, unknown>>(
    type: AgentFeedEventType,
    payload: T
  ): Promise<AgentFeedEvent<T>>;
}

export function createEventPublisher(
  eventBus: EventBus,
  taskId: string,
  nodeId: string,
  actorId: string,
  correlationId: string,
  recordedMessages?: AgentFeedEvent[]
): EventPublisher {
  return {
    async publish<T = Record<string, unknown>>(
      type: AgentFeedEventType,
      payload: T
    ): Promise<AgentFeedEvent<T>> {
      const evt = await eventBus.publish<T>({
        eventId: generateId('evt'),
        taskId,
        nodeId,
        type,
        timestamp: getTimestamp(),
        actorType: 'agent',
        actorId,
        correlationId,
        payload,
      });
      if (recordedMessages) {
        recordedMessages.push(evt as unknown as AgentFeedEvent);
      }
      return evt;
    },
  };
}

export async function loadUpstreamArtifactContents(
  artifacts: Artifact[],
  artifactService: ArtifactService
): Promise<Map<string, string>> {
  const contents = new Map<string, string>();
  for (const art of artifacts) {
    try {
      const text = await artifactService.readArtifactContent(art.id);
      contents.set(art.id, text);
    } catch {
      contents.set(art.id, '');
    }
  }
  return contents;
}

export interface ExecuteLlmOptions {
  provider: LlmProvider;
  request: LlmCompletionRequest;
  publisher: EventPublisher;
  nodeId: string;
  noStream?: boolean;
  onTextChunk?: (chunk: string) => void | Promise<void>;
}

export async function executeLlmWithEvents(
  options: ExecuteLlmOptions
): Promise<LlmCompletionResult> {
  const { provider, request, publisher, nodeId, noStream, onTextChunk } = options;
  const isStreaming = !noStream && typeof (provider as { stream?: unknown }).stream === 'function';

  // 1. Publish llm_call_started
  await publisher.publish('llm_call_started', {
    nodeId,
    model: request.model,
    provider: provider.name,
    isStreaming,
    estimatedInputTokens: Math.ceil(
      request.messages.reduce((acc, m) => acc + m.content.length, 0) / 4
    ),
  });

  const streamingProvider = asStreamingLlmProvider(provider);
  let lastProgressEmitTime = 0;
  let tokensSoFar = 0;

  if (noStream) {
    const result = await provider.complete(request);
    await publisher.publish('llm_call_completed', {
      nodeId,
      model: result.model,
      provider: result.provider,
      latencyMs: result.latencyMs,
      usage: result.usage,
    });
    return result;
  }

  const result = await streamingProvider.stream(request, async (chunk) => {
    if (chunk.text) {
      tokensSoFar += Math.ceil(chunk.text.length / 4);

      if (onTextChunk) {
        await onTextChunk(chunk.text);
      }

      // Bound progress updates to avoid flooding event bus / TUI (emit at most every 150ms or on finish)
      const now = Date.now();
      if (now - lastProgressEmitTime > 150 || chunk.finishReason) {
        lastProgressEmitTime = now;
        await publisher.publish('llm_progress', {
          nodeId,
          deltaText: chunk.text,
          tokensSoFar,
        });
      }
    }
  });

  // 2. Publish llm_call_completed
  await publisher.publish('llm_call_completed', {
    nodeId,
    model: result.model,
    provider: result.provider,
    latencyMs: result.latencyMs,
    usage: result.usage,
  });

  return result;
}
