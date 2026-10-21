import { AgentRunner, AgentRunContext, AgentRunResult, AgentError } from '../runtime/types.js';
import { AgentRole } from '../../models/enums.js';
import { generateId } from '../../../utils/ids.js';
import { getTimestamp } from '../../../utils/time.js';
import { AgentFeedEvent } from '../../events/event-types.js';
import { repositoryContextService } from '../../workspace/repository-context.service.js';
import { RepositoryBrief } from '../schemas/coding-schemas.js';

async function wait(ms: number, fast?: boolean, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw new AgentError('Execution aborted by signal', false);
  }
  const delay = fast ? Math.max(10, Math.floor(ms / 15)) : ms;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, delay);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(new AgentError('Execution aborted by signal', false));
    };
    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort);
  });
}

export class MockExplorerAgent implements AgentRunner {
  readonly role: AgentRole = 'explorer';

  async run(context: AgentRunContext): Promise<AgentRunResult> {
    const { taskId, nodeId, goal, node, signal, toolRegistry, eventBus, artifactService, fast, workspaceRoot } = context;
    const actorId = `agent_${this.role}`;
    const correlationId = generateId('corr');
    const messages: AgentFeedEvent[] = [];

    const publish = async <T = Record<string, unknown>>(
      type: AgentFeedEvent['type'],
      payload: T
    ): Promise<AgentFeedEvent<T>> => {
      const evt = await eventBus.publish<T>({
        eventId: generateId('evt'),
        taskId,
        nodeId,
        type,
        timestamp: getTimestamp(),
        actorType: 'agent',
        actorId,
        correlationId,
        payload,
      });
      messages.push(evt as unknown as AgentFeedEvent);
      return evt;
    };

    try {
      // 1. node_started
      await publish('node_started', {
        nodeId,
        title: node.title,
        assignedAgentRole: this.role,
      });

      await wait(150, fast, signal);

      // 2. agent_message (thought)
      await publish('agent_message', {
        nodeId,
        kind: 'thought',
        content: `Exploring repository architecture, dependencies, and relevant patterns for "${goal}"...`,
      });

      await wait(150, fast, signal);

      const targetRoot = workspaceRoot || process.cwd();
      const repoContext = await repositoryContextService.buildContext(targetRoot, { goal });

      const brief: RepositoryBrief = {
        summary: `Workspace at "${targetRoot}" analyzed with ${repoContext.languages.join(', ') || 'unspecified language'}. Package manager: ${repoContext.packageManager || 'unknown'}. Test command: ${repoContext.testCommand || 'none detected'}.`,
        languages: repoContext.languages,
        relevantFiles: repoContext.relevantFiles,
        existingPatterns: repoContext.conventions,
        risks: [
          'Workspace changes must strictly adhere to PathGuard boundaries',
          'Avoid introducing uninstalled third-party dependencies',
        ],
        openQuestions: [],
      };

      const toolContext = {
        taskId,
        nodeId,
        actorId,
        agentRole: this.role,
        correlationId,
        artifactService,
        eventBus,
        workspaceRoot: targetRoot,
      };

      // 3. Optional exploration via tool registry (read-only)
      await toolRegistry.execute('list_directory', { directoryPath: '.' }, toolContext);

      await wait(200, fast, signal);

      // 4. Output repository brief artifact
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

## Relevant Files Identified
${brief.relevantFiles.map((f) => `- \`${f}\``).join('\n') || '- (No specific files flagged; project-wide)'}

## Existing Conventions & Patterns
${brief.existingPatterns.map((p) => `- ${p}`).join('\n')}

## Project Tree
\`\`\`text
${repoContext.projectStructure}
\`\`\`

## Risks & Boundary Constraints
${brief.risks.map((r) => `- ${r}`).join('\n')}
`;

      const artRes = await toolRegistry.execute('create_markdown_artifact', {
        title: `Repository Brief: ${node.title}`,
        filename: 'repository-brief.md',
        content: briefMarkdown,
      }, toolContext);

      if (!artRes.ok || !artRes.data) {
        throw new AgentError(`Failed to create repository brief artifact: ${artRes.error || 'Unknown error'}`, false);
      }

      const createdArtifact = artRes.data as { artifactId: string; path: string };

      // 5. node_completed
      await publish('node_completed', {
        nodeId,
        outputArtifactId: createdArtifact.artifactId,
        summary: `Repository exploration complete. Analyzed ${repoContext.languages.join(', ') || 'stack'} across ${brief.relevantFiles.length} candidate files.`,
      });

      return {
        status: 'done',
        outputArtifactIds: [createdArtifact.artifactId],
        messages,
        usage: {
          inputTokens: 120,
          outputTokens: 380,
        },
      };
    } catch (err: unknown) {
      if (err instanceof AgentError) throw err;
      const errorMsg = err instanceof Error ? err.message : String(err);
      await publish('error_occurred', { error: errorMsg, phase: 'explorer_execution' });
      return {
        status: 'failed',
        error: new AgentError(errorMsg, false),
        outputArtifactIds: [],
        messages,
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    }
  }
}
