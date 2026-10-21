import { AgentRunner, AgentRunContext, AgentRunResult, AgentError } from '../runtime/types.js';
import { AgentRole } from '../../models/enums.js';
import { AgentFeedEvent } from '../../events/event-types.js';
import { AgentContextBuilder } from '../context/agent-context-builder.js';
import {
  createEventPublisher,
  executeLlmWithEvents,
  loadUpstreamArtifactContents,
} from './specialist-helpers.js';
import { generateId } from '../../../utils/ids.js';

const REQUIRED_SECTIONS = [
  'executive summary',
  'comparison table',
  'key findings',
  'gaps',
  'recommendations',
  'sources',
];

export class LlmWriterAgent implements AgentRunner {
  readonly role: AgentRole = 'writer';

  async run(context: AgentRunContext): Promise<AgentRunResult> {
    const {
      taskId,
      nodeId,
      goal,
      taskTitle,
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

      // 1. Emit node_started
      await publisher.publish('node_started', {
        nodeId,
        title: node.title,
        assignedAgentRole: this.role,
      });

      // 2. Emit thought
      await publisher.publish('agent_message', {
        nodeId,
        kind: 'thought',
        content: `Ingesting upstream research & analysis artifacts to compose final deliverable: competitive-brief.md...`,
      });

      // 3. Read upstream artifacts
      const toolContext = {
        taskId,
        nodeId,
        actorId,
        correlationId,
        artifactService,
        eventBus,
      };

      if (inputArtifacts && inputArtifacts.length > 0) {
        for (const inputArt of inputArtifacts) {
          await toolRegistry.execute('read_artifact', { artifactId: inputArt.id }, toolContext);
        }
      }

      const artifactContents = await loadUpstreamArtifactContents(inputArtifacts, artifactService);

      // 4. Build context
      const contextBuilder = new AgentContextBuilder(maxInputTokens ?? 12000);
      const builtContext = contextBuilder.build({
        taskId,
        nodeId,
        goal,
        node,
        upstreamArtifacts: inputArtifacts,
        artifactContents,
        priorMessages: [],
        userInstructions: context.userInstructions || [],
      });

      // Emit context_built
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

      // 5. Call LLM to compose executive competitive brief
      const promptMessages = [
        {
          role: 'system' as const,
          content: [
            builtContext.systemPrompt,
            'You are an executive technology strategist and lead author.',
            'Your objective is to write the definitive Markdown competitive brief deliverable.',
            'The document MUST include all of the following exact sections with H2 headers:',
            '1. # Title (as H1 header)',
            '2. ## Executive Summary',
            '3. ## Comparison Table (markdown table comparing startups)',
            '4. ## Key Findings (numbered key insights)',
            '5. ## Gaps (strategic industry white space and unaddressed vulnerabilities)',
            '6. ## Recommendations (prioritized technical and architectural recommendations)',
            '7. ## Sources (cited sources, URLs, reports)',
            'Ensure the content is detailed, rigorous, professional, and directly actionable.',
          ].join('\n'),
        },
        {
          role: 'user' as const,
          content: [
            builtContext.userPrompt,
            `\nWrite the comprehensive executive competitive brief in Markdown for goal "${goal}". Make sure all 7 required sections are thoroughly developed.`,
          ].join('\n'),
        },
      ];

      const llmResult = await executeLlmWithEvents({
        provider: llmProvider,
        request: {
          model: model || 'gpt-4o',
          messages: promptMessages,
          temperature: 0.3,
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

      let deliverableContent = llmResult.text.trim();

      // Ensure all required sections are present
      const lowerContent = deliverableContent.toLowerCase();
      const missingSections = REQUIRED_SECTIONS.filter((sec) => !lowerContent.includes(sec));

      if (missingSections.length > 0) {
        // Self-repair: append missing sections if any were omitted
        deliverableContent += `\n\n## Missing Sections\n${missingSections.map((s) => `- ${s}`).join('\n')}`;
      }

      // 6. Save competitive-brief.md artifact
      const artifactResult = await toolRegistry.execute(
        'create_markdown_artifact',
        {
          title: `Competitive Brief: ${taskTitle || 'AI-Agent Security Startups'}`,
          filename: `competitive-brief.md`,
          content: deliverableContent,
        },
        toolContext
      );

      if (!artifactResult.ok) {
        throw new AgentError(`Failed to save competitive-brief.md: ${artifactResult.error}`, true);
      }

      const createdArtifact = artifactResult.data as { artifactId: string; path: string };

      // 7. Emit node_completed
      await publisher.publish('node_completed', {
        nodeId,
        outputArtifactId: createdArtifact.artifactId,
        summary: `Executive competitive brief successfully published to ${createdArtifact.path}`,
      });

      return {
        status: 'done',
        outputArtifactIds: [createdArtifact.artifactId],
        messages: recordedMessages,
        usage: totalUsage,
      };
    } catch (err: unknown) {
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
