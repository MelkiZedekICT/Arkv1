import { LlmProvider } from '../../llm/types.js';
import { EventBus } from '../../events/event-bus.js';
import { UsageRepository } from '../../storage/repositories/usage.repository.js';
import { ProposedPlan } from './planner.schema.js';
import { PlanValidator } from './plan-validator.js';
import {
  buildPlannerPromptMessages,
  PlannerPromptOptions,
} from './planner.prompt.js';
import { generateId } from '../../../utils/ids.js';
import { getTimestamp } from '../../../utils/time.js';

export interface PlannerAgentOptions {
  provider: LlmProvider;
  eventBus: EventBus;
  usageRepo?: UsageRepository;
  maxRepairRetries?: number;
}

export interface PlanGenerationRequest {
  taskId: string;
  goal: string;
  constraints?: string[];
  maxTasks?: number;
  revisionFeedback?: string;
  repositoryBrief?: string;
}

export class PlannerAgent {
  private readonly provider: LlmProvider;
  private readonly eventBus: EventBus;
  private readonly usageRepo?: UsageRepository;
  private readonly maxRepairRetries: number;

  constructor(options: PlannerAgentOptions) {
    this.provider = options.provider;
    this.eventBus = options.eventBus;
    this.usageRepo = options.usageRepo;
    this.maxRepairRetries = options.maxRepairRetries ?? 2;
  }

  async generatePlan(request: PlanGenerationRequest): Promise<ProposedPlan> {
    const { taskId, goal, constraints, maxTasks, revisionFeedback, repositoryBrief } = request;
    const correlationId = generateId('corr');

    // 1. Emit planner_started
    await this.eventBus.publish({
      eventId: generateId('evt'),
      taskId,
      type: 'planner_started',
      timestamp: getTimestamp(),
      actorType: 'agent',
      actorId: 'agent_planner',
      correlationId,
      payload: {
        provider: this.provider.name,
      },
    });

    // 2. Emit progressive status: Understanding
    await this.eventBus.publish({
      eventId: generateId('evt'),
      taskId,
      type: 'planner_message',
      timestamp: getTimestamp(),
      actorType: 'agent',
      actorId: 'agent_planner',
      correlationId,
      payload: {
        content: 'Understanding goal and technical requirements...',
        phase: 'understanding',
      },
    });

    let attempt = 0;
    let previousRawText = '';
    let validationErrors: string[] = [];

    while (attempt <= this.maxRepairRetries) {
      attempt++;

      // Emit status on design / repair
      if (attempt === 1) {
        await this.eventBus.publish({
          eventId: generateId('evt'),
          taskId,
          type: 'planner_message',
          timestamp: getTimestamp(),
          actorType: 'agent',
          actorId: 'agent_planner',
          correlationId,
          payload: {
            content: 'Designing task graph across specialist agents...',
            phase: 'designing',
          },
        });
      } else {
        await this.eventBus.publish({
          eventId: generateId('evt'),
          taskId,
          type: 'planner_message',
          timestamp: getTimestamp(),
          actorType: 'agent',
          actorId: 'agent_planner',
          correlationId,
          payload: {
            content: `Repairing plan schema and validation constraints (attempt ${attempt}/${this.maxRepairRetries + 1})...`,
            phase: 'repairing',
          },
        });
      }

      const promptOptions: PlannerPromptOptions = {
        goal,
        constraints,
        maxTasks,
        revisionFeedback,
        repositoryBrief,
        previousPlanJson: attempt > 1 ? previousRawText : undefined,
        validationErrors: attempt > 1 ? validationErrors : undefined,
      };

      const messages = buildPlannerPromptMessages(promptOptions);

      // Call LLM
      const completion = await this.provider.complete({
        model: '',
        messages,
        temperature: 0.2,
        responseFormat: 'json',
      });

      previousRawText = completion.text;

      // 3. Emit response received
      await this.eventBus.publish({
        eventId: generateId('evt'),
        taskId,
        type: 'planner_response_received',
        timestamp: getTimestamp(),
        actorType: 'agent',
        actorId: 'agent_planner',
        correlationId,
        payload: {
          rawResponseLength: completion.text.length,
          latencyMs: completion.latencyMs,
          usage: completion.usage,
        },
      });

      // 4. Persist usage record if repo provided
      if (this.usageRepo) {
        try {
          await this.usageRepo.create({
            id: generateId('use'),
            taskId,
            agentId: 'agent_planner',
            model: completion.model,
            inputTokens: completion.usage.inputTokens,
            outputTokens: completion.usage.outputTokens,
            estimatedCost: completion.usage.estimatedCostUsd ?? 0,
            toolCalls: 0,
            createdAt: getTimestamp(),
          });
        } catch {
          // Usage recording failure should not break planning flow
        }
      }

      // Emit status: Validating
      await this.eventBus.publish({
        eventId: generateId('evt'),
        taskId,
        type: 'planner_message',
        timestamp: getTimestamp(),
        actorType: 'agent',
        actorId: 'agent_planner',
        correlationId,
        payload: {
          content: 'Validating plan schema, acyclic dependencies, and criteria...',
          phase: 'validating',
        },
      });

      // 5. Parse JSON
      let parsedJson: unknown;
      try {
        // Strip any markdown code fences if model accidentally wrapped output
        const cleanedText = completion.text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
        parsedJson = JSON.parse(cleanedText);
      } catch (err) {
        validationErrors = [`Invalid JSON output: ${(err as Error).message}`];
        await this.eventBus.publish({
          eventId: generateId('evt'),
          taskId,
          type: 'plan_validation_failed',
          timestamp: getTimestamp(),
          actorType: 'agent',
          actorId: 'agent_planner',
          correlationId,
          payload: {
            errors: validationErrors,
            attempt,
            maxAttempts: this.maxRepairRetries + 1,
          },
        });
        continue;
      }

      // 6. Validate Plan structure and graph rules
      const validation = PlanValidator.validate(parsedJson);

      if (!validation.isValid || !validation.plan) {
        validationErrors = validation.errors;
        await this.eventBus.publish({
          eventId: generateId('evt'),
          taskId,
          type: 'plan_validation_failed',
          timestamp: getTimestamp(),
          actorType: 'agent',
          actorId: 'agent_planner',
          correlationId,
          payload: {
            errors: validationErrors,
            attempt,
            maxAttempts: this.maxRepairRetries + 1,
          },
        });
        continue;
      }

      // 7. Successful plan proposed
      const validPlan = validation.plan;
      await this.eventBus.publish({
        eventId: generateId('evt'),
        taskId,
        type: 'plan_proposed',
        timestamp: getTimestamp(),
        actorType: 'agent',
        actorId: 'agent_planner',
        correlationId,
        payload: {
          title: validPlan.title,
          summary: validPlan.summary,
          assumptions: validPlan.assumptions,
          risks: validPlan.risks,
          nodes: validPlan.tasks as unknown as Array<Record<string, unknown>>,
        },
      });

      return validPlan;
    }

    // Exhausted retries
    const finalErrorMsg = `Planner failed to generate a valid plan after ${this.maxRepairRetries + 1} attempts: ${validationErrors.join(', ')}`;
    await this.eventBus.publish({
      eventId: generateId('evt'),
      taskId,
      type: 'error_occurred',
      timestamp: getTimestamp(),
      actorType: 'agent',
      actorId: 'agent_planner',
      correlationId,
      payload: {
        error: finalErrorMsg,
        fatal: true,
      },
    });

    throw new Error(finalErrorMsg);
  }
}
