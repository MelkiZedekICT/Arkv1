import { appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { AgentFeedEvent } from './event-types.js';

export class EventStore {
  private logFilePath: string;

  constructor(baseDir: string) {
    this.logFilePath = join(baseDir, 'events.jsonl');
    mkdirSync(dirname(this.logFilePath), { recursive: true });
  }

  append(event: AgentFeedEvent): void {
    const line = JSON.stringify(event) + '\n';
    appendFileSync(this.logFilePath, line, 'utf-8');
  }
}
