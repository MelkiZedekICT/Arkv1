import { EventEmitter } from 'events';
import { AgentFeedEvent } from './event-types.js';
import { EventStore } from './event-store.js';

type EventHandler = (event: AgentFeedEvent) => void;

export class EventBus {
  private emitter = new EventEmitter();
  private store: EventStore;

  constructor(store: EventStore) {
    this.store = store;
  }

  emit(event: AgentFeedEvent): void {
    // Persist event to JSONL
    this.store.append(event);
    
    // Broadcast event in-process
    this.emitter.emit(event.type, event);
    this.emitter.emit('*', event); // Wildcard for logging/debugging
  }

  on(eventType: AgentFeedEvent['type'] | '*', handler: EventHandler): void {
    this.emitter.on(eventType, handler);
  }

  off(eventType: AgentFeedEvent['type'] | '*', handler: EventHandler): void {
    this.emitter.off(eventType, handler);
  }
}
