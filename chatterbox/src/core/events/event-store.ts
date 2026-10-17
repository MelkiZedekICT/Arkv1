import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { AgentFeedEvent, AgentFeedEventSchema } from './event-types.js';
import { TaskStatus } from '../models/enums.js';

export interface TaskReplayResult {
  taskId: string;
  status: TaskStatus;
  eventCount: number;
  firstEventTimestamp: string | null;
  lastEventTimestamp: string | null;
  events: AgentFeedEvent[];
}

export class EventStore {
  private eventsDir: string;

  constructor(baseStorageDir: string) {
    this.eventsDir = join(baseStorageDir, 'events');
    mkdirSync(this.eventsDir, { recursive: true });
  }

  getEventFilePath(taskId: string): string {
    return join(this.eventsDir, `${taskId}.jsonl`);
  }

  async appendEvent(event: AgentFeedEvent): Promise<void> {
    // Validate event before writing
    const validated = AgentFeedEventSchema.parse(event);
    const filePath = this.getEventFilePath(validated.taskId);
    const line = JSON.stringify(validated) + '\n';
    appendFileSync(filePath, line, 'utf-8');
  }

  // Alias for backward compatibility
  async append(event: AgentFeedEvent): Promise<void> {
    return this.appendEvent(event);
  }

  async getEvents(taskId: string): Promise<AgentFeedEvent[]> {
    const filePath = this.getEventFilePath(taskId);
    if (!existsSync(filePath)) {
      return [];
    }

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);

    const events: AgentFeedEvent[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        events.push(AgentFeedEventSchema.parse(parsed) as AgentFeedEvent);
      } catch (err) {
        // Skip corrupted or unparseable lines
        console.warn(`[EventStore] Failed to parse event line for task ${taskId}:`, err);
      }
    }

    return events;
  }

  async replayTask(taskId: string): Promise<TaskReplayResult> {
    const events = await this.getEvents(taskId);

    if (events.length === 0) {
      return {
        taskId,
        status: 'draft',
        eventCount: 0,
        firstEventTimestamp: null,
        lastEventTimestamp: null,
        events: [],
      };
    }

    let status: TaskStatus = 'draft';
    for (const evt of events) {
      switch (evt.type) {
        case 'task_created':
          status = (evt.payload.status as TaskStatus) || 'draft';
          break;
        case 'plan_proposed':
          status = 'planning';
          break;
        case 'approval_requested':
          status = 'awaiting_approval';
          break;
        case 'plan_approved':
        case 'node_started':
        case 'task_resumed':
          status = 'running';
          break;
        case 'task_paused':
          status = 'paused';
          break;
        case 'plan_rejected':
          status = 'blocked';
          break;
        case 'node_failed':
        case 'error_occurred':
          if (evt.payload.fatal) {
            status = 'failed';
          }
          break;
        case 'task_completed':
          status = 'done';
          break;
      }
    }

    return {
      taskId,
      status,
      eventCount: events.length,
      firstEventTimestamp: events[0]?.timestamp ?? null,
      lastEventTimestamp: events[events.length - 1]?.timestamp ?? null,
      events,
    };
  }
}
