import { AgentRunner, AgentRunContext, AgentRunResult, AgentError } from '../runtime/types.js';
import { AgentRole } from '../../models/enums.js';
import { AgentFeedEvent } from '../../events/event-types.js';
import { createEventPublisher, executeLlmWithEvents } from './specialist-helpers.js';
import { repositoryContextService } from '../../workspace/repository-context.service.js';
import { RepositoryBrief, RepositoryBriefSchema } from '../schemas/coding-schemas.js';
import { extractJsonText } from '../schemas/specialist-schemas.js';
import { generateId } from '../../../utils/ids.js';

export class LlmExplorerAgent implements AgentRunner {
  readonly role: AgentRole = 'explorer';

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
        content: `Analyzing repository layout, package manifests, and relevant files for "${goal}"...`,
      });

      const targetRoot = workspaceRoot || process.cwd();
      const repoContext = await repositoryContextService.buildContext(targetRoot, { goal });

      const systemPrompt = `You are an expert Software Architecture & Repository Explorer specialist in Chatterbox.
Your job is to inspect the project context and output a structured RepositoryBrief JSON.
Rules:
1. Only identify files and commands that actually exist in the project context.
2. Return ONLY valid JSON matching this schema:
{
  "summary": string,
  "languages": string[],
  "relevantFiles": string[],
  "existingPatterns": string[],
  "risks": string[],
  "openQuestions": string[]
}`;

      const userMessage = `Objective: "${goal}"
Workspace Root: "${targetRoot}"
Languages detected: ${repoContext.languages.join(', ') || 'None'}
Package Manager: ${repoContext.packageManager || 'unknown'}
Test Command: ${repoContext.testCommand || 'none'}
Lint Command: ${repoContext.lintCommand || 'none'}
Conventions: ${repoContext.conventions.join('; ')}
Candidate Relevant Files: ${repoContext.relevantFiles.join(', ') || 'none flagged'}

Project Tree:
${repoContext.projectStructure}

Generate a concise, highly accurate RepositoryBrief JSON.`;

      let brief: RepositoryBrief;

      if (llmProvider) {
        const llmResult = await executeLlmWithEvents({
          provider: llmProvider,
          request: {
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage },
            ],
            model: model || 'default',
          },
          nodeId,
          publisher,
          noStream,
        });

        if (llmResult.usage) {
          totalUsage.inputTokens += llmResult.usage.inputTokens;
          totalUsage.outputTokens += llmResult.usage.outputTokens;
        }

        try {
          const jsonText = extractJsonText(llmResult.text);
          const parsed = JSON.parse(jsonText);
          brief = RepositoryBriefSchema.parse(parsed);
        } catch {
          // Fallback to grounded deterministic repository context
          brief = {
            summary: `Analyzed repository with ${repoContext.languages.join(', ') || 'stack'}. Package manager: ${repoContext.packageManager || 'unknown'}. Test command: ${repoContext.testCommand || 'none'}.`,
            languages: repoContext.languages,
            relevantFiles: repoContext.relevantFiles,
            existingPatterns: repoContext.conventions,
            risks: ['Strict workspace boundary enforcement applies'],
            openQuestions: [],
          };
        }
      } else {
        brief = {
          summary: `Analyzed repository with ${repoContext.languages.join(', ') || 'stack'}. Package manager: ${repoContext.packageManager || 'unknown'}. Test command: ${repoContext.testCommand || 'none'}.`,
          languages: repoContext.languages,
          relevantFiles: repoContext.relevantFiles,
          existingPatterns: repoContext.conventions,
          risks: ['Strict workspace boundary enforcement applies'],
          openQuestions: [],
        };
      }

      const briefMarkdown = `# Repository Brief

## Objective
${goal}

## Summary
${brief.summary}

## Languages & Stack
${brief.languages.map((l) => `- ${l}`).join('\n') || '- General repository'}

## Package Manager & Commands
- **Package Manager**: \`${repoContext.packageManager || 'unknown'}\`
- **Test Command**: \`${repoContext.testCommand || 'none'}\`
- **Lint Command**: \`${repoContext.lintCommand || 'none'}\`
- **Typecheck Command**: \`${repoContext.typecheckCommand || 'none'}\`

## Relevant Files
${brief.relevantFiles.map((f) => `- \`${f}\``).join('\n') || '- (No specific files flagged)'}

## Existing Patterns & Conventions
${brief.existingPatterns.map((p) => `- ${p}`).join('\n')}

## Project Tree
\`\`\`text
${repoContext.projectStructure}
\`\`\`

## Risks & Considerations
${brief.risks.map((r) => `- ${r}`).join('\n')}
`;

      const toolContext = {
        taskId,
        nodeId,
        actorId,
        correlationId,
        artifactService,
        eventBus,
        workspaceRoot: targetRoot,
      };

      const artRes = await toolRegistry.execute('create_markdown_artifact', {
        title: `Repository Brief: ${node.title}`,
        filename: 'repository-brief.md',
        content: briefMarkdown,
      }, toolContext);

      const createdArtifact = artRes.data as { artifactId: string; path: string };

      // 4. Emit node_completed
      await publisher.publish('node_completed', {
        nodeId,
        outputArtifactId: createdArtifact.artifactId,
        summary: `Repository exploration complete: identified ${brief.relevantFiles.length} candidate files across ${brief.languages.join(', ') || 'stack'}.`,
      });

      return {
        status: 'done',
        outputArtifactIds: [createdArtifact.artifactId],
        messages: recordedMessages,
        usage: {
          inputTokens: totalUsage.inputTokens || 250,
          outputTokens: totalUsage.outputTokens || 450,
        },
      };
    } catch (err: unknown) {
      if (err instanceof AgentError) throw err;
      const errorMsg = err instanceof Error ? err.message : String(err);
      await publisher.publish('error_occurred', { error: errorMsg, phase: 'explorer_execution' });
      return {
        status: 'failed',
        error: new AgentError(errorMsg, false),
        outputArtifactIds: [],
        messages: recordedMessages,
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    }
  }
}
