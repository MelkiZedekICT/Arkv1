import { AgentRunner, AgentRunContext, AgentRunResult, AgentError } from '../runtime/types.js';
import { AgentRole } from '../../models/enums.js';
import { AgentFeedEvent } from '../../events/event-types.js';
import { AgentContextBuilder } from '../context/agent-context-builder.js';
import { createEventPublisher, executeLlmWithEvents, loadUpstreamArtifactContents } from './specialist-helpers.js';
import { buildPlannerSystemPrompt } from '../planner/planner.prompt.js';
import { generateId } from '../../../utils/ids.js';
import { getTimestamp } from '../../../utils/time.js';

export class LlmPlannerAgent implements AgentRunner {
  readonly role: AgentRole = 'planner';

  async run(context: AgentRunContext): Promise<AgentRunResult> {
    const {
      taskId,
      nodeId,
      goal,
      node,
      inputArtifacts,
      signal,
      llmProvider,
      toolRegistry,
      eventBus,
      artifactService,
      maxInputTokens,
      noStream,
      model,
      workspaceRoot,
    } = context;

    const actorId = `agent_${this.role}`;
    const correlationId = generateId('corr');
    const recordedMessages: AgentFeedEvent[] = [];
    const publisher = createEventPublisher(
      eventBus,
      taskId,
      nodeId,
      actorId,
      correlationId,
      recordedMessages
    );

    const totalUsage = { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 };

    try {
      if (signal?.aborted) {
        throw new AgentError('Execution cancelled by signal', false);
      }

      await publisher.publish('node_started', {
        nodeId,
        title: node.title,
        assignedAgentRole: this.role,
      });

      await publisher.publish('agent_message', {
        nodeId,
        kind: 'thought',
        content: `Synthesizing repository discovery findings and formulating execution plan for "${node.title}"...`,
      });

      const toolContext = {
        taskId,
        nodeId,
        actorId,
        correlationId,
        artifactService,
        eventBus,
        workspaceRoot,
      };

      const artifactContents = await loadUpstreamArtifactContents(inputArtifacts || [], artifactService);
      const contextBuilder = new AgentContextBuilder(maxInputTokens ?? 12000);
      const builtContext = contextBuilder.build({
        taskId,
        nodeId,
        goal,
        node,
        upstreamArtifacts: inputArtifacts || [],
        artifactContents,
        priorMessages: [],
        userInstructions: context.userInstructions || [],
      });

      await publisher.publish('context_built', {
        nodeId,
        goal,
        assignedAgentRole: this.role,
        inputTokenBudget: maxInputTokens ?? 12000,
        estimatedInputTokens: builtContext.estimatedInputTokens,
        includedArtifactIds: builtContext.includedArtifactIds,
        includedMessageIds: builtContext.includedMessageIds,
      });

      if (signal?.aborted) {
        throw new AgentError('Execution cancelled by signal', false);
      }

      let planMarkdown = '';
      if (!llmProvider) {
        // Deterministic fallback when running without LLM provider
        planMarkdown = `# Implementation Plan: ${node.title}

**Goal**: ${goal}
**Author**: ${actorId}
**Date**: ${getTimestamp()}

## Architectural Approach
1. Formulate focused code changes strictly adhering to repository conventions.
2. Maintain workspace boundary and PathGuard restrictions.
3. Validate functionality through allowlisted project test commands.
`;
      } else {
        const promptMessages = [
          {
            role: 'system' as const,
            content: [builtContext.systemPrompt, buildPlannerSystemPrompt()].join('\n\n'),
          },
          {
            role: 'user' as const,
            content: [
              builtContext.userPrompt,
              `\nSynthesize the repository context into an actionable implementation plan for: "${goal}". Detail target files, architectural approach, and testing strategy in clean Markdown.`,
            ].join('\n'),
          },
        ];

        const llmResult = await executeLlmWithEvents({
          provider: llmProvider,
          request: {
            model: model || 'gpt-4o',
            messages: promptMessages,
            temperature: 0.2,
            signal,
          },
          publisher,
          nodeId,
          noStream,
        });

        totalUsage.inputTokens += llmResult.usage.inputTokens;
        totalUsage.outputTokens += llmResult.usage.outputTokens;
        if (llmResult.usage.estimatedCostUsd) {
          totalUsage.estimatedCostUsd += llmResult.usage.estimatedCostUsd;
        }

        planMarkdown = llmResult.text;
      }

      const artifactResult = await toolRegistry.execute(
        'create_markdown_artifact',
        {
          title: `Implementation Plan: ${node.title}`,
          filename: 'implementation-plan.md',
          content: planMarkdown,
        },
        toolContext
      );

      if (!artifactResult.ok) {
        throw new AgentError(`Failed to save implementation plan artifact: ${artifactResult.error}`, true);
      }

      const createdArtifact = artifactResult.data as { artifactId: string; path: string };

      await publisher.publish('node_completed', {
        nodeId,
        outputArtifactId: createdArtifact.artifactId,
        summary: `Planner completed implementation plan; recorded in ${createdArtifact.artifactId}`,
      });

      return {
        status: 'done',
        outputArtifactIds: [createdArtifact.artifactId],
        messages: recordedMessages,
        usage: totalUsage,
      };
    } catch (err) {
      const isAbort = signal?.aborted;
      const agentErr =
        err instanceof AgentError
          ? err
          : new AgentError(err instanceof Error ? err.message : String(err), !isAbort);

      if (!isAbort) {
        await publisher.publish('error_occurred', {
          nodeId,
          error: agentErr.message,
          fatal: false,
        });
      }

      return {
        status: isAbort ? 'blocked' : 'failed',
        outputArtifactIds: [],
        messages: recordedMessages,
        usage: totalUsage,
        error: agentErr,
      };
    }
  }
}
