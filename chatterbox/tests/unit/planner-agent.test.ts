import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { PlannerAgent } from '../../src/core/agents/planner/planner.agent.js';
import { MockPlannerProvider } from '../../src/core/llm/mock-planner-provider.js';
import { LlmProvider, LlmCompletionRequest, LlmCompletionResult } from '../../src/core/llm/types.js';
import { EventStore } from '../../src/core/events/event-store.js';
import { EventBus } from '../../src/core/events/event-bus.js';
import { getDatabase, AppDatabase } from '../../src/core/storage/database.js';
import { UsageRepository } from '../../src/core/storage/repositories/usage.repository.js';
import { TaskRepository } from '../../src/core/storage/repositories/task.repository.js';
import { AgentFeedEvent } from '../../src/core/events/event-types.js';
import { getTimestamp } from '../../src/utils/time.js';

describe('PlannerAgent', () => {
  let tempDir: string;
  let db: AppDatabase;
  let eventStore: EventStore;
  let eventBus: EventBus;
  let usageRepo: UsageRepository;
  let taskRepo: TaskRepository;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'chatterbox-planner-test-'));
    db = getDatabase(join(tempDir, 'test.db'));
    eventStore = new EventStore(tempDir);
    eventBus = new EventBus(eventStore);
    usageRepo = new UsageRepository(db);
    taskRepo = new TaskRepository(db);
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('generates plan, emits expected events, and persists token usage', async () => {
    await taskRepo.create({
      id: 'task_unit_1',
      title: 'Real-Time Analytics Task',
      goal: 'Develop real-time analytics dashboard',
      status: 'planning',
      createdBy: 'operator',
      createdAt: getTimestamp(),
      updatedAt: getTimestamp(),
    });

    const provider = new MockPlannerProvider({ simulatedLatencyMs: 5 });
    const planner = new PlannerAgent({
      provider,
      eventBus,
      usageRepo,
      maxRepairRetries: 2,
    });

    const events: AgentFeedEvent[] = [];
    eventBus.on('*', (evt) => events.push(evt));

    const plan = await planner.generatePlan({
      taskId: 'task_unit_1',
      goal: 'Develop real-time analytics dashboard',
    });

    expect(plan).toBeDefined();
    expect(plan.title.toLowerCase()).toContain('analytics dashboard');
    expect(plan.tasks.length).toBeGreaterThan(0);

    // Verify event stream sequence
    const types = events.map((e) => e.type);
    expect(types).toContain('planner_started');
    expect(types).toContain('planner_message');
    expect(types).toContain('planner_response_received');
    expect(types).toContain('plan_proposed');

    // Verify usage was saved to SQLite
    const usages = await usageRepo.listByTaskId('task_unit_1');
    expect(usages.length).toBe(1);
    expect(usages[0].agentId).toBe('agent_planner');
    expect(usages[0].inputTokens).toBeGreaterThan(0);
    expect(usages[0].outputTokens).toBeGreaterThan(0);
  });

  it('triggers repair loop on invalid schema and recovers on subsequent attempt', async () => {
    let callCount = 0;
    const flakeyProvider: LlmProvider = {
      name: 'flakey-test-provider',
      async complete(req: LlmCompletionRequest): Promise<LlmCompletionResult> {
        callCount++;
        if (callCount === 1) {
          // Return invalid JSON missing required fields and with a self-cycle
          return {
            text: JSON.stringify({
              title: 'Flawed Plan',
              summary: 'Has cycle',
              assumptions: [],
              risks: [],
              tasks: [
                {
                  id: 'bad_1',
                  title: 'Bad Task',
                  description: 'Desc',
                  assignedAgentRole: 'analyst',
                  dependsOn: ['bad_1'], // self-cycle!
                  acceptanceCriteria: ['None'],
                  estimatedEffort: 'medium',
                },
              ],
            }),
            usage: { inputTokens: 100, outputTokens: 50 },
            model: 'test-model',
            provider: 'flakey',
          };
        }

        // Second call receives the repair prompt and returns a valid plan
        const validPlan = {
          title: 'Repaired Plan',
          summary: 'Cycle removed',
          assumptions: [],
          risks: [],
          tasks: [
            {
              id: 'task_fixed',
              title: 'Fixed Task',
              description: 'Now valid and acyclic',
              assignedAgentRole: 'researcher',
              dependsOn: [],
              acceptanceCriteria: ['Valid output verified'],
              estimatedEffort: 'low',
            },
          ],
        };

        return {
          text: JSON.stringify(validPlan),
          usage: { inputTokens: 150, outputTokens: 60 },
          model: 'test-model',
          provider: 'flakey',
        };
      },
    };

    const planner = new PlannerAgent({
      provider: flakeyProvider,
      eventBus,
      usageRepo,
      maxRepairRetries: 2,
    });

    const events: AgentFeedEvent[] = [];
    eventBus.on('*', (evt) => events.push(evt));

    const plan = await planner.generatePlan({
      taskId: 'task_repair_test',
      goal: 'Test repair mechanism',
    });

    expect(callCount).toBe(2);
    expect(plan.title).toBe('Repaired Plan');

    const types = events.map((e) => e.type);
    expect(types).toContain('plan_validation_failed');
    expect(types).toContain('plan_proposed');
  });

  it('throws and emits error_occurred when maxRepairRetries is exceeded', async () => {
    const brokenProvider: LlmProvider = {
      name: 'broken-test-provider',
      async complete(): Promise<LlmCompletionResult> {
        return {
          text: 'This is not JSON at all, totally unparseable garbage!',
          usage: { inputTokens: 50, outputTokens: 20 },
          model: 'test-model',
          provider: 'broken',
        };
      },
    };

    const planner = new PlannerAgent({
      provider: brokenProvider,
      eventBus,
      usageRepo,
      maxRepairRetries: 1, // 1 retry -> 2 total attempts
    });

    const events: AgentFeedEvent[] = [];
    eventBus.on('*', (evt) => events.push(evt));

    await expect(
      planner.generatePlan({
        taskId: 'task_broken_test',
        goal: 'Should fail gracefully',
      })
    ).rejects.toThrow('Planner failed to generate a valid plan after 2 attempts');

    const types = events.map((e) => e.type);
    expect(types).toContain('error_occurred');
  });
});
