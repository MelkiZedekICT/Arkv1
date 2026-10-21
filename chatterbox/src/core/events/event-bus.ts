import { EventEmitter } from 'events';
import { AgentFeedEvent, AgentFeedEventSchema, AgentFeedEventType } from './event-types.js';
import { EventStore } from './event-store.js';
import { logger } from '../../utils/logger.js';

export type EventHandler<T extends AgentFeedEvent = AgentFeedEvent> = (
  event: T
) => void | Promise<void>;

export class EventBus {
  private emitter = new EventEmitter();
  private processedEventIds = new Set<string>();

  constructor(private store?: EventStore) {
    this.emitter.setMaxListeners(100);
  }

  async publish<TPayload = Record<string, unknown>>(
    event: AgentFeedEvent<TPayload>
  ): Promise<AgentFeedEvent<TPayload>> {
    // 1. Validate event schema
    const validated = AgentFeedEventSchema.parse(event) as AgentFeedEvent<TPayload>;

    // 2. Prevent duplicate event IDs
    if (this.processedEventIds.has(validated.eventId)) {
      throw new Error(`Duplicate event ID rejected: "${validated.eventId}"`);
    }
    this.processedEventIds.add(validated.eventId);

    // 3. Persist to per-task JSONL store if store provided
    if (this.store) {
      await this.store.appendEvent(validated as AgentFeedEvent);
    }

    // 4. Emit to typed subscribers safely
    this.dispatchSafe(validated.type, validated);
    this.dispatchSafe('*', validated);

    return validated;
  }

  // Alias for backward compatibility
  emit<TPayload = Record<string, unknown>>(event: AgentFeedEvent<TPayload>): void {
    void this.publish(event);
  }

  subscribe<T extends AgentFeedEvent = AgentFeedEvent>(
    eventType: AgentFeedEventType | '*',
    handler: EventHandler<T>
  ): () => void {
    const wrapped = async (event: unknown) => {
      try {
        await handler(event as T);
      } catch (err) {
        logger.error(`[EventBus] Unhandled error in listener for "${eventType}"`, err);
      }
    };

    this.emitter.on(eventType, wrapped);

    // Return unbind function
    return () => {
      this.emitter.off(eventType, wrapped);
    };
  }

  unsubscribe<T extends AgentFeedEvent = AgentFeedEvent>(
    eventType: AgentFeedEventType | '*',
    handler: EventHandler<T>
  ): void {
    this.emitter.off(eventType, handler as (...args: unknown[]) => void);
  }

  // Aliases for standard EventEmitter API
  on<T extends AgentFeedEvent = AgentFeedEvent>(
    eventType: AgentFeedEventType | '*',
    handler: EventHandler<T>
  ): () => void {
    return this.subscribe(eventType, handler);
  }

  off<T extends AgentFeedEvent = AgentFeedEvent>(
    eventType: AgentFeedEventType | '*',
    handler: EventHandler<T>
  ): void {
    this.unsubscribe(eventType, handler);
  }

  private dispatchSafe(eventType: string, event: unknown): void {
    const listeners = this.emitter.listeners(eventType);
    for (const listener of listeners) {
      try {
        const result: unknown = listener(event);
        if (result instanceof Promise) {
          result.catch((err: unknown) => {
            logger.error(`[EventBus] Async listener error for "${eventType}"`, err);
          });
        }
      } catch (err) {
        logger.error(`[EventBus] Sync listener error for "${eventType}"`, err);
      }
    }
  }
}
