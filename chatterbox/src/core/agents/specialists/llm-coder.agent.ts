import { AgentRunner, AgentRunContext, AgentRunResult, AgentError } from '../runtime/types.js';
import { AgentRole } from '../../models/enums.js';
import { AgentFeedEvent } from '../../events/event-types.js';
import { AgentContextBuilder } from '../context/agent-context-builder.js';
import { createEventPublisher, executeLlmWithEvents, loadUpstreamArtifactContents } from './specialist-helpers.js';
import { buildCoderSystemPrompt } from '../prompts/coder.prompt.js';
import { CodeChangePlan, CodeChangePlanSchema } from '../schemas/coding-schemas.js';
import { parseOrRepairJson } from '../schemas/specialist-schemas.js';
import { generateId } from '../../../utils/ids.js';
import { getTimestamp } from '../../../utils/time.js';
import { changesetService } from '../../workspace/changeset.service.js';


export class LlmCoderAgent implements AgentRunner {
  readonly role: AgentRole = 'coder';

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

      // 1. Emit node_started and coder_started
      await publisher.publish('node_started', {
        nodeId,
        title: node.title,
        assignedAgentRole: this.role,
      });

      await publisher.publish('coder_started', {
        nodeId,
        taskTitle: node.title,
      });

      // 2. Emit thought
      await publisher.publish('agent_message', {
        nodeId,
        kind: 'thought',
        content: `Analyzing repository structure and planned changes for "${node.title}"...`,
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

      // 3. Search and explore relevant files
      await toolRegistry.execute('search_workspace', { query: goal.slice(0, 30), maxResults: 10 }, toolContext);

      // 4. Build context
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

      let changePlan: CodeChangePlan;

      if (llmProvider) {
        const promptMessages = [
          {
            role: 'system' as const,
            content: [builtContext.systemPrompt, buildCoderSystemPrompt()].join('\n\n'),
          },
          {
            role: 'user' as const,
            content: [
              builtContext.userPrompt,
              `\nImplement the necessary code changes for task "${node.title}". Output your technical change plan and files to create/modify in valid JSON matching the CodeChangePlan schema.`,
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

        const repairResult = await parseOrRepairJson({
          rawText: llmResult.text,
          schema: CodeChangePlanSchema,
          provider: llmProvider,
          model: model || 'gpt-4o',
          signal,
          maxRepairAttempts: 2,
          onRepairAttempt: async (attempt, err) => {
            await publisher.publish('agent_message', {
              nodeId,
              kind: 'thought',
              content: `Repairing CodeChangePlan JSON (attempt ${attempt}): ${err}`,
            });
          },
        });

        changePlan = repairResult.data;
        totalUsage.inputTokens += repairResult.totalTokensUsed.inputTokens;
        totalUsage.outputTokens += repairResult.totalTokensUsed.outputTokens;
      } else {
        // Safe deterministic fallback when no LLM provider is present
        changePlan = {
          summary: `Implemented code changes for ${node.title}`,
          operations: [
            {
              operation: 'create_folder',
              path: 'src/generated',
              reason: 'Validation module folder',
            },
            {
              operation: 'create_file',
              path: 'src/generated/validation.ts',
              content: `// Validation module for ${goal}\nexport function validateInput(input: unknown): boolean {\n  return input !== null && typeof input === 'object';\n}\n`,
              reason: 'Input validation helper',
            },
          ],
          testStrategy: 'Unit tests using allowlisted test runner',
          risks: ['Strict workspace boundaries apply'],
        };
      }

      // 5. Emit coder_proposed_changes
      await publisher.publish('coder_proposed_changes', {
        summary: changePlan.summary,
        operationsCount: changePlan.operations.length,
        operations: changePlan.operations,
      });

      // 6. Propose and apply multi-file changeset via ChangesetService
      const effectiveRoot = workspaceRoot || process.cwd();
      changesetService.setWorkspaceRoot(effectiveRoot);
      changesetService.setEventBus(eventBus);

      const proposedChangeset = await changesetService.propose({
        taskId,
        nodeId,
        agentRole: this.role,
        operations: changePlan.operations,
        summary: changePlan.summary,
      });

      const applyRes = await changesetService.apply({
        changesetId: proposedChangeset.id,
        approvedById: actorId,
      });

      if (!applyRes.success) {
        throw new AgentError(`Failed to apply changeset "${proposedChangeset.id}": ${applyRes.error}`, true);
      }


      // 7. Save change artifact
      const summaryMarkdown = `# Code Changes: ${node.title}

**Goal**: ${goal}
**Task Node**: ${node.title}
**Author**: ${actorId}
**Timestamp**: ${getTimestamp()}

## Summary
${changePlan.summary}

## Operations Applied (${changePlan.operations.length})
${changePlan.operations.map((op) => `- \`${op.operation}\`: \`${op.path}\` (${op.reason})`).join('\n')}

## Test Strategy
${changePlan.testStrategy}

## Risks
${changePlan.risks.map((r) => `- ${r}`).join('\n') || '- None flagged'}
`;

      const artifactResult = await toolRegistry.execute(
        'create_markdown_artifact',
        {
          title: `Code Changes: ${node.title}`,
          filename: `code-changes-${nodeId.split('_').pop() || '1'}.md`,
          content: summaryMarkdown,
        },
        toolContext
      );

      if (!artifactResult.ok) {
        throw new AgentError(`Failed to save code change artifact: ${artifactResult.error}`, true);
      }

      const createdArtifact = artifactResult.data as { artifactId: string; path: string };

      // 8. Emit coder_completed and node_completed
      await publisher.publish('coder_completed', {
        outputArtifactId: createdArtifact.artifactId,
        operationsApplied: changePlan.operations.length,
        summary: changePlan.summary,
      });

      await publisher.publish('node_completed', {
        nodeId,
        outputArtifactId: createdArtifact.artifactId,
        summary: `Coder finished changes for ${node.title}; recorded in ${createdArtifact.artifactId}`,
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
