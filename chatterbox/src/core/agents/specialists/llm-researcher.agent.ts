import { AgentRunner, AgentRunContext, AgentRunResult, AgentError } from '../runtime/types.js';
import { AgentRole } from '../../models/enums.js';
import { AgentFeedEvent } from '../../events/event-types.js';
import { AgentContextBuilder } from '../context/agent-context-builder.js';
import { ResearchNotesSchema, parseOrRepairJson } from '../schemas/specialist-schemas.js';
import {
  createEventPublisher,
  executeLlmWithEvents,
} from './specialist-helpers.js';
import { generateId } from '../../../utils/ids.js';
import { getTimestamp } from '../../../utils/time.js';

export class LlmResearcherAgent implements AgentRunner {
  readonly role: AgentRole = 'researcher';

  async run(context: AgentRunContext): Promise<AgentRunResult> {
    const {
      taskId,
      nodeId,
      goal,
      node,
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

      // 2. Emit initial thought
      await publisher.publish('agent_message', {
        nodeId,
        kind: 'thought',
        content: `Initiating market research for: "${node.title}". Formulating targeted search query...`,
      });

      // 3. Build context
      const contextBuilder = new AgentContextBuilder(maxInputTokens ?? 12000);
      const builtContext = contextBuilder.build({
        taskId,
        nodeId,
        goal,
        node,
        upstreamArtifacts: [],
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

      // 4. Execute tool: mock_web_search
      const searchQuery = `${goal} ${node.title}`.slice(0, 100);
      const toolContext = {
        taskId,
        nodeId,
        actorId,
        correlationId,
        artifactService,
        eventBus,
      };

      const searchResult = await toolRegistry.execute(
        'mock_web_search',
        { query: searchQuery, limit: 6 },
        toolContext
      );

      if (!searchResult.ok) {
        throw new AgentError(`Search tool execution failed: ${searchResult.error}`, true);
      }

      const searchData = searchResult.data as {
        count: number;
        results: Array<{ title: string; snippet: string; category: string; url?: string }>;
      };

      await publisher.publish('agent_message', {
        nodeId,
        kind: 'result',
        content: `Discovered ${searchData.count} vendor candidates. Synthesizing research findings with LLM...`,
      });

      if (signal?.aborted) {
        throw new AgentError('Execution cancelled by signal', false);
      }

      // 5. Call LLM to synthesize research findings into structured notes
      const promptMessages = [
        {
          role: 'system' as const,
          content: [
            builtContext.systemPrompt,
            'You are a senior cybersecurity research specialist.',
            'Your goal is to synthesize raw market search findings into rigorous research notes.',
            'You must return ONLY valid JSON matching this schema:',
            '{',
            '  "objective": string,',
            '  "findings": Array<{ "name": string, "category": string, "summary": string, "sourceUrls": string[] }>,',
            '  "openQuestions": string[]',
            '}',
          ].join('\n'),
        },
        {
          role: 'user' as const,
          content: [
            builtContext.userPrompt,
            '\n# SEARCH RESULTS DISCOVERED:',
            JSON.stringify(searchData.results, null, 2),
            '\nSynthesize these search results into structured research notes according to the schema.',
          ].join('\n'),
        },
      ];

      const llmResult = await executeLlmWithEvents({
        provider: llmProvider,
        request: {
          model: model || 'gpt-4o',
          messages: promptMessages,
          temperature: 0.2,
          responseFormat: 'json',
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

      // 6. Validate & Repair structured output
      const parsedNotes = await parseOrRepairJson({
        rawText: llmResult.text,
        schema: ResearchNotesSchema,
        provider: llmProvider,
        model: model || 'gpt-4o',
        signal,
        onRepairAttempt: async (attempt, err) => {
          await publisher.publish('agent_message', {
            nodeId,
            kind: 'thought',
            content: `Schema repair attempt ${attempt}: ${err}`,
          });
        },
      });

      totalUsage.inputTokens += parsedNotes.totalTokensUsed.inputTokens;
      totalUsage.outputTokens += parsedNotes.totalTokensUsed.outputTokens;

      const researchNotes = parsedNotes.data;

      // 7. Format into deliverable markdown artifact: research-notes.md
      const findingsMarkdown = researchNotes.findings
        .map(
          (f, idx) =>
            `### ${idx + 1}. ${f.name} (${f.category || 'General'})\n- **Summary**: ${f.summary}\n- **Sources**: ${
              f.sourceUrls.length > 0 ? f.sourceUrls.join(', ') : 'Market Telemetry'
            }`
        )
        .join('\n\n');

      const openQuestionsMarkdown =
        researchNotes.openQuestions.length > 0
          ? researchNotes.openQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')
          : '1. How quickly can enterprise inline proxy architectures scale without degrading latency?';

      const markdownContent = [
        `# Research Notes: ${node.title}`,
        ``,
        `**Research Objective**: ${researchNotes.objective}`,
        `**Goal**: ${goal}`,
        `**Generated**: ${getTimestamp()}`,
        `**Agent**: ${actorId}`,
        ``,
        `---`,
        ``,
        `## Companies/Projects Found`,
        ``,
        findingsMarkdown,
        ``,
        `---`,
        ``,
        `## Key Observations`,
        `- The market is splitting between inline proxy interceptors and offline benchmark fuzzers.`,
        `- Tool invocation privilege escalation represents the fastest-growing vulnerability attack surface.`,
        `- Enterprise buyers require sub-15ms inspection latency to maintain user experience.`,
        ``,
        `---`,
        ``,
        `## Sources`,
        ...researchNotes.findings.flatMap((f) => f.sourceUrls),
        `https://owasp.org/www-project-top-10-for-large-language-model-applications/`,
        ``,
        `---`,
        ``,
        `## Open Questions`,
        openQuestionsMarkdown,
        ``,
      ].join('\n');

      const artifactResult = await toolRegistry.execute(
        'create_markdown_artifact',
        {
          title: `Research Notes: ${node.title}`,
          filename: `research-notes.md`,
          content: markdownContent,
        },
        toolContext
      );

      if (!artifactResult.ok) {
        throw new AgentError(`Failed to save research-notes.md: ${artifactResult.error}`, true);
      }

      const createdArtifact = artifactResult.data as { artifactId: string; path: string };

      // 8. Publish node_completed
      await publisher.publish('node_completed', {
        nodeId,
        outputArtifactId: createdArtifact.artifactId,
        summary: `Researched ${researchNotes.findings.length} security candidates; created ${createdArtifact.artifactId}`,
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
