import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getRoleColor } from '../../src/tui/components/AgentAvatar.js';
import { EventBus } from '../../src/core/events/event-bus.js';
import { EventStore } from '../../src/core/events/event-store.js';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('TUI State & Components Logic', () => {
  describe('getRoleColor', () => {
    it('returns proper distinct colors for all specialist roles', () => {
      expect(getRoleColor('planner')).toBe('cyan');
      expect(getRoleColor('researcher')).toBe('green');
      expect(getRoleColor('analyst')).toBe('yellow');
      expect(getRoleColor('writer')).toBe('magenta');
      expect(getRoleColor('reviewer')).toBe('blue');
      expect(getRoleColor('user')).toBe('greenBright');
      expect(getRoleColor('system')).toBe('gray');
      expect(getRoleColor('unknown')).toBe('gray');
    });
  });

  describe('Event-driven Feed State', () => {
    let tempDir: string;
    let eventStore: EventStore;
    let eventBus: EventBus;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'chatterbox-tui-state-'));
      eventStore = new EventStore(tempDir);
      eventBus = new EventBus(eventStore);
    });

    afterEach(() => {
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('collects events via EventBus subscription in order', async () => {
      const captured: string[] = [];
      eventBus.subscribe('*', (e) => {
        captured.push(e.type);
      });

      await eventBus.publish({
        eventId: 'evt_1',
        taskId: 'task_demo',
        type: 'task_created',
        timestamp: '2026-10-17T12:00:00.000Z',
        actorType: 'user',
        actorId: 'user_local',
        correlationId: 'corr_1',
        payload: { goal: 'Test TUI State', title: 'TUI Task' },
      });

      await eventBus.publish({
        eventId: 'evt_2',
        taskId: 'task_demo',
        type: 'agent_message',
        timestamp: '2026-10-17T12:00:01.000Z',
        actorType: 'agent',
        actorId: 'agent_planner',
        correlationId: 'corr_1',
        payload: { content: 'Plan created' },
      });

      expect(captured).toEqual(['task_created', 'agent_message']);
    });
  });
});
