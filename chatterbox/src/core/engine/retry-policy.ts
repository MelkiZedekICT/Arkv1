import { EventBus } from '../events/event-bus.js';
import { AgentError } from '../agents/runtime/types.js';
import { generateId } from '../../utils/ids.js';
import { getTimestamp } from '../../utils/time.js';

export interface RetryPolicyOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  backoffMultiplier?: number;
  jitter?: boolean;
  fast?: boolean;
}

export class RetryPolicy {
  readonly maxAttempts: number;
  readonly initialDelayMs: number;
  readonly backoffMultiplier: number;
  readonly jitter: boolean;
  readonly fast: boolean;

  constructor(options: RetryPolicyOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? 2;
    this.fast = Boolean(options.fast);
    this.initialDelayMs = this.fast ? 40 : (options.initialDelayMs ?? 1000);
    this.backoffMultiplier = options.backoffMultiplier ?? 2;
    this.jitter = options.jitter ?? true;
  }

  isTransientError(error: unknown): boolean {
    if (error instanceof AgentError) {
      return error.isTransient;
    }
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      // Non-transient errors: schema validation, missing inputs, permanently invalid data
      if (
        msg.includes('validation') ||
        msg.includes('missing') ||
        msg.includes('cannot be empty') ||
        msg.includes('not found in repository') ||
        msg.includes('path traversal') ||
        msg.includes('aborted')
      ) {
        return false;
      }
    }
    // Default to transient for unexpected network/timeout/execution failures
    return true;
  }

  shouldRetry(attempt: number, error: unknown): boolean {
    if (attempt >= this.maxAttempts) {
      return false;
    }
    return this.isTransientError(error);
  }

  calculateDelay(attempt: number): number {
    const base = this.initialDelayMs * Math.pow(this.backoffMultiplier, attempt - 1);
    if (this.fast) {
      return Math.min(60, Math.max(15, Math.floor(base / 10)));
    }
    if (!this.jitter) {
      return base;
    }
    const jitterAmount = Math.floor(Math.random() * (base * 0.2));
    return base + jitterAmount;
  }

  async executeWithRetry<T>(options: {
    taskId: string;
    nodeId: string;
    actorId?: string;
    correlationId?: string;
    eventBus: EventBus;
    signal?: AbortSignal;
    operation: (attempt: number) => Promise<T>;
  }): Promise<T> {
    const { taskId, nodeId, eventBus, operation, signal } = options;
    const actorId = options.actorId || 'system';
    const correlationId = options.correlationId || generateId('corr');

    let attempt = 1;

    while (true) {
      if (signal?.aborted) {
        throw new AgentError('Aborted by signal', false);
      }

      try {
        return await operation(attempt);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);

        if (this.shouldRetry(attempt, err)) {
          const delayMs = this.calculateDelay(attempt);

          // 1. Publish node_retry_scheduled
          await eventBus.publish({
            eventId: generateId('evt'),
            taskId,
            nodeId,
            type: 'node_retry_scheduled',
            timestamp: getTimestamp(),
            actorType: 'system',
            actorId,
            correlationId,
            payload: {
              nodeId,
              attempt,
              maxAttempts: this.maxAttempts,
              delayMs,
              error: errorMsg,
            },
          });

          // Wait backoff delay with abort signal support
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
              cleanup();
              resolve();
            }, delayMs);
            const onAbort = () => {
              clearTimeout(timer);
              cleanup();
              reject(new AgentError('Retry delay aborted by signal', false));
            };
            const cleanup = () => {
              signal?.removeEventListener('abort', onAbort);
            };
            signal?.addEventListener('abort', onAbort);
          });

          attempt++;

          // 2. Publish node_retry_started
          await eventBus.publish({
            eventId: generateId('evt'),
            taskId,
            nodeId,
            type: 'node_retry_started',
            timestamp: getTimestamp(),
            actorType: 'system',
            actorId,
            correlationId,
            payload: {
              nodeId,
              attempt,
              maxAttempts: this.maxAttempts,
            },
          });

          continue;
        }

        // Retries exhausted or non-transient
        if (attempt > 1 || attempt >= this.maxAttempts) {
          await eventBus.publish({
            eventId: generateId('evt'),
            taskId,
            nodeId,
            type: 'node_retry_exhausted',
            timestamp: getTimestamp(),
            actorType: 'system',
            actorId,
            correlationId,
            payload: {
              nodeId,
              attempts: attempt,
              error: errorMsg,
            },
          });
        }

        throw err;
      }
    }
  }
}
