import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { RetryPolicy } from '../../src/core/engine/retry-policy.js';
import { EventStore } from '../../src/core/events/event-store.js';
import { EventBus } from '../../src/core/events/event-bus.js';
import { AgentError } from '../../src/core/agents/runtime/types.js';
import { AgentFeedEvent } from '../../src/core/events/event-types.js';

describe('RetryPolicy', () => {
  let tempDir: string;
  let eventStore: EventStore;
  let eventBus: EventBus;
  const taskId = 'task_retry_test';
  const nodeId = 'task_retry_test_node_1';

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'agentfeed-retry-test-'));
    eventStore = new EventStore(tempDir);
    eventBus = new EventBus(eventStore);
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('retries transient failures and succeeds (Test 5)', async () => {
    const policy = new RetryPolicy({ maxAttempts: 2, fast: true });
    const events: AgentFeedEvent[] = [];
    eventBus.on('*', (e) => events.push(e));

    let attemptCount = 0;
    const result = await policy.executeWithRetry({
      taskId,
      nodeId,
      eventBus,
      operation: async (attempt) => {
        attemptCount++;
        if (attempt === 1) {
          throw new AgentError('Transient network socket timeout', true);
        }
        return 'success on attempt 2';
      },
    });

    expect(result).toBe('success on attempt 2');
    expect(attemptCount).toBe(2);

    const types = events.map((e) => e.type);
    expect(types).toContain('node_retry_scheduled');
    expect(types).toContain('node_retry_started');
    expect(types).not.toContain('node_retry_exhausted');
  });

  it('exhausts retries and throws error (Test 6)', async () => {
    const policy = new RetryPolicy({ maxAttempts: 2, fast: true });
    const events: AgentFeedEvent[] = [];
    eventBus.on('*', (e) => events.push(e));

    let attemptCount = 0;
    await expect(
      policy.executeWithRetry({
        taskId,
        nodeId,
        eventBus,
        operation: async () => {
          attemptCount++;
          throw new AgentError('Persistent database lock', true);
        },
      })
    ).rejects.toThrow('Persistent database lock');

    expect(attemptCount).toBe(2);

    const types = events.map((e) => e.type);
    expect(types).toContain('node_retry_scheduled');
    expect(types).toContain('node_retry_started');
    expect(types).toContain('node_retry_exhausted');
  });

  it('does not retry permanent validation errors', async () => {
    const policy = new RetryPolicy({ maxAttempts: 2, fast: true });
    let attemptCount = 0;

    await expect(
      policy.executeWithRetry({
        taskId,
        nodeId,
        eventBus,
        operation: async () => {
          attemptCount++;
          throw new AgentError('Missing required upstream research artifact', false);
        },
      })
    ).rejects.toThrow(/missing/i);

    // Non-transient errors must NOT be retried
    expect(attemptCount).toBe(1);
  });
});
