import { AgentRunner, AgentRunContext, AgentRunResult, AgentError } from '../runtime/types.js';
import { AgentRole } from '../../models/enums.js';
import { AgentFeedEvent } from '../../events/event-types.js';
import { AgentContextBuilder } from '../context/agent-context-builder.js';
import { AnalysisSchema, parseOrRepairJson } from '../schemas/specialist-schemas.js';
import {
  createEventPublisher,
  executeLlmWithEvents,
  loadUpstreamArtifactContents,
} from './specialist-helpers.js';
import { generateId } from '../../../utils/ids.js';
import { getTimestamp } from '../../../utils/time.js';

export class LlmAnalystAgent implements AgentRunner {
  readonly role: AgentRole = 'analyst';

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

      // 2. Validate input artifacts exist
      if (!inputArtifacts || inputArtifacts.length === 0) {
        throw new AgentError(
          `Analyst requires upstream research artifacts to analyze, but none were provided for node "${node.title}".`,
          false // Permanent input validation error
        );
      }

      // 3. Emit thought
      await publisher.publish('agent_message', {
        nodeId,
        kind: 'thought',
        content: `Ingesting ${inputArtifacts.length} research artifact(s) to build dimensional competitive analysis...`,
      });

      // 4. Read upstream artifact(s) using tool
      const toolContext = {
        taskId,
        nodeId,
        actorId,
        correlationId,
        artifactService,
        eventBus,
      };

      const targetInputArtifact = inputArtifacts[0];
      const readResult = await toolRegistry.execute(
        'read_artifact',
        { artifactId: targetInputArtifact.id },
        toolContext
      );

      if (!readResult.ok) {
        throw new AgentError(`Failed to read input artifact "${targetInputArtifact.id}": ${readResult.error}`, true);
      }

      const artifactContents = await loadUpstreamArtifactContents(inputArtifacts, artifactService);

      // 5. Build context
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

      // 6. Call LLM to extract structured comparative dimensions
      const promptMessages = [
        {
          role: 'system' as const,
          content: [
            builtContext.systemPrompt,
            'You are a cybersecurity competitive intelligence analyst.',
            'Extract and compare companies across structured architectural vectors.',
            'You must return ONLY valid JSON strictly adhering to this schema:',
            '{',
            '  "companies": Array<{',
            '    "name": string,',
            '    "category": string,',
            '    "targetCustomer": string,',
            '    "securityApproach": string,',
            '    "deploymentModel": "cloud" | "self-hosted" | "hybrid" | "unknown",',
            '    "strengths": string[],',
            '    "weaknesses": string[],',
            '    "sources": string[]',
            '  }>,',
            '  "gaps": string[],',
            '  "recommendations": string[]',
            '}',
          ].join('\n'),
        },
        {
          role: 'user' as const,
          content: [
            builtContext.userPrompt,
            '\nAnalyze the provided upstream research notes and output the structured JSON analysis.',
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

      // 7. Validate with Zod & repair if needed
      const parsedAnalysis = await parseOrRepairJson({
        rawText: llmResult.text,
        schema: AnalysisSchema,
        provider: llmProvider,
        model: model || 'gpt-4o',
        signal,
        onRepairAttempt: async (attempt, err) => {
          await publisher.publish('agent_message', {
            nodeId,
            kind: 'thought',
            content: `Analyst schema repair attempt ${attempt}: ${err}`,
          });
        },
      });

      totalUsage.inputTokens += parsedAnalysis.totalTokensUsed.inputTokens;
      totalUsage.outputTokens += parsedAnalysis.totalTokensUsed.outputTokens;

      const analysisData = parsedAnalysis.data;

      // 8. Generate analysis.md and analysis.json artifacts
      const matrixRows = analysisData.companies
        .map(
          (c) =>
            `| **${c.name}** | ${c.category} | ${c.securityApproach} | ${c.deploymentModel} | ${c.strengths.slice(0, 2).join('; ')} |`
        )
        .join('\n');

      const gapsList = analysisData.gaps.map((g, i) => `${i + 1}. ${g}`).join('\n');
      const recsList = analysisData.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n');

      const analysisMarkdown = [
        `# Structured Competitive Analysis: AI-Agent Security Startups`,
        ``,
        `**Task**: ${node.title}`,
        `**Generated**: ${getTimestamp()}`,
        `**Author**: ${actorId}`,
        ``,
        `---`,
        ``,
        `## Dimensional Comparison Matrix`,
        ``,
        `| Company | Category | Security Approach | Deployment | Key Strengths |`,
        `| :--- | :--- | :--- | :--- | :--- |`,
        matrixRows,
        ``,
        `---`,
        ``,
        `## Strategic Gaps Identified`,
        gapsList,
        ``,
        `---`,
        ``,
        `## Architectural Recommendations`,
        recsList,
        ``,
        `---`,
        `## Machine-Readable Data Payload`,
        `\`\`\`json`,
        JSON.stringify(analysisData, null, 2),
        `\`\`\``,
      ].join('\n');

      const artifactResult = await toolRegistry.execute(
        'create_markdown_artifact',
        {
          title: `Competitive Analysis: ${node.title}`,
          filename: `analysis.md`,
          content: analysisMarkdown,
        },
        toolContext
      );

      if (!artifactResult.ok) {
        throw new AgentError(`Failed to save analysis artifact: ${artifactResult.error}`, true);
      }

      const createdArtifact = artifactResult.data as { artifactId: string; path: string };

      // 9. Publish node_completed
      await publisher.publish('node_completed', {
        nodeId,
        outputArtifactId: createdArtifact.artifactId,
        summary: `Structured comparison generated for ${analysisData.companies.length} vendors in ${createdArtifact.artifactId}`,
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
