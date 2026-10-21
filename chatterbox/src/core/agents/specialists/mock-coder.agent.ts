import { AgentRunner, AgentRunContext, AgentRunResult, AgentError } from '../runtime/types.js';
import { AgentRole } from '../../models/enums.js';
import { generateId } from '../../../utils/ids.js';
import { getTimestamp } from '../../../utils/time.js';
import { AgentFeedEvent } from '../../events/event-types.js';
import { changesetService } from '../../workspace/changeset.service.js';

import { ProposedFileOperation } from '../schemas/coding-schemas.js';



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

export class MockCoderAgent implements AgentRunner {
  readonly role: AgentRole = 'coder';

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

      await wait(200, fast, signal);

      // 2. agent_message (thought)
      await publish('agent_message', {
        nodeId,
        kind: 'thought',
        content: `Exploring workspace to plan code modifications for "${goal}"...`,
      });

      await wait(150, fast, signal);

      const toolContext = {
        taskId,
        nodeId,
        actorId,
        correlationId,
        artifactService,
        eventBus,
        workspaceRoot,
      };

      // 3. Search repository
      await toolRegistry.execute('search_workspace', { query: 'validation', maxResults: 5 }, toolContext);
      await wait(200, fast, signal);

      // 4. Propose file operations and multi-file changeset
      const validationFile = `// Auto-generated validation module for: ${goal}
export function validateInput(input: unknown): boolean {
  if (typeof input !== 'object' || input === null) return false;
  return true;
}
`;
      const operations: ProposedFileOperation[] = [
        { operation: 'create_folder', path: 'src/generated', reason: 'Module directory for validation logic' },
        { operation: 'create_file', path: 'src/generated/validation.ts', content: validationFile, reason: 'Input validation schema and helper' },
      ];

      const effectiveRoot = workspaceRoot || process.cwd();
      changesetService.setWorkspaceRoot(effectiveRoot);
      changesetService.setEventBus(eventBus);

      const changeset = await changesetService.propose({
        taskId,
        nodeId,
        agentRole: this.role,
        operations,
        summary: `Input validation module for ${goal}`,
      });

      await wait(150, fast, signal);

      await changesetService.approve({
        changesetId: changeset.id,
        approverId: actorId,
      });

      const applyRes = await changesetService.apply({
        changesetId: changeset.id,
        approvedById: actorId,
      });

      if (!applyRes.success) {
        throw new AgentError(`Failed to apply changeset: ${applyRes.error}`, true);
      }

      await wait(200, fast, signal);


      // 6. Propose change summary artifact
      const summaryMarkdown = `# Code Changes Implemented: ${node.title}

**Goal**: ${goal}
**Task Node**: ${node.title}
**Agent**: ${actorId}
**Timestamp**: ${getTimestamp()}

## Summary of Changes
- Created \`src/generated/validation.ts\` with input validation logic.
- Established clean module boundary adhering to workspace security constraints.

## Files Created
- \`src/generated/validation.ts\`

## Files Modified
- None

## Next Steps
- Hand off to Tester agent to verify module execution and coverage.
`;

      const artRes = await toolRegistry.execute('create_markdown_artifact', {
        title: `Code Changes: ${node.title}`,
        filename: `code-changes-${nodeId.split('_').pop() || '1'}.md`,
        content: summaryMarkdown,
      }, toolContext);

      const createdArtifact = artRes.data as { artifactId: string; path: string };

      await wait(150, fast, signal);

      // 7. node_completed
      await publish('node_completed', {
        nodeId,
        outputArtifactId: createdArtifact.artifactId,
        summary: `Implemented code changes for ${node.title}; recorded in ${createdArtifact.artifactId}`,
      });

      return {
        status: 'done',
        outputArtifactIds: [createdArtifact.artifactId],
        messages,
        usage: {
          inputTokens: 350,
          outputTokens: 520,
          estimatedCostUsd: 0.0045,
        },
      };
    } catch (err: unknown) {
      const isAbort = signal?.aborted;
      const agentErr =
        err instanceof AgentError
          ? err
          : new AgentError(err instanceof Error ? err.message : String(err), !isAbort);

      if (!isAbort) {
        await publish('error_occurred', {
          nodeId,
          error: agentErr.message,
          fatal: false,
        });
      }

      return {
        status: isAbort ? 'blocked' : 'failed',
        outputArtifactIds: [],
        messages,
        usage: { inputTokens: 50, outputTokens: 20 },
        error: agentErr,
      };
    }
  }
}
