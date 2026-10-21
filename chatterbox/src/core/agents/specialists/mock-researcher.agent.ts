import { AgentRunner, AgentRunContext, AgentRunResult, AgentError } from '../runtime/types.js';
import { AgentRole } from '../../models/enums.js';
import { generateId } from '../../../utils/ids.js';
import { getTimestamp } from '../../../utils/time.js';
import { AgentFeedEvent } from '../../events/event-types.js';

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

export class MockResearcherAgent implements AgentRunner {
  readonly role: AgentRole = 'researcher';

  async run(context: AgentRunContext): Promise<AgentRunResult> {
    const { taskId, nodeId, goal, node, signal, toolRegistry, eventBus, artifactService, fast } = context;
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

      await wait(250, fast, signal);

      // 2. agent_message (thought)
      await publish('agent_message', {
        nodeId,
        kind: 'thought',
        content: `Analyzing goal "${goal}" and searching candidate AI security vendors for: ${node.title}`,
      });

      await wait(200, fast, signal);

      // 3. tool_call (mock_web_search)
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
        { query: searchQuery, limit: 5 },
        toolContext
      );

      if (!searchResult.ok) {
        throw new AgentError(`Mock search failed: ${searchResult.error}`, true);
      }

      await wait(250, fast, signal);

      // 4. agent_message (result)
      const searchData = searchResult.data as { count: number; results: Array<{ title: string; category: string }> };
      const vendorNames = searchData.results.map((r) => r.title.split(':')[0]).join(', ');
      await publish('agent_message', {
        nodeId,
        kind: 'result',
        content: `Discovered ${searchData.count} key startup references: ${vendorNames}. Synthesizing research notes...`,
      });

      await wait(200, fast, signal);

      // 5. artifact_created (research-notes.md)
      const researchNotesContent = `# Research Notes: AI-Agent Security Landscape

**Task**: ${node.title}
**Goal**: ${goal}
**Timestamp**: ${getTimestamp()}
**Author**: ${actorId}

## Discovered Companies and Vendors

1. **PromptArmor** (Runtime Guardrails)
   - Focus: Zero-day prompt injection traps, context tampering defense.
   - Strengths: Millisecond payload validation and automated honeypots.

2. **Lakera AI** (Agent Application Firewall)
   - Focus: Guardrail latency <10ms, multi-modal prompt injection filtering.
   - Strengths: Enterprise tool loop protection and data leakage interception.

3. **Robust Intelligence** (Validation & Red-Teaming)
   - Focus: Automated stress testing and adversarial tool manipulation probing.
   - Strengths: Comprehensive benchmark coverage and model firewalling.

4. **HiddenLayer** (AI EDR & MLSecOps)
   - Focus: Endpoint Detection & Response tailored to model payloads and ML pipelines.
   - Strengths: Deep model supply-chain vulnerability inspection.

5. **Apex Security** (Agent IAM & Tool Governance)
   - Focus: Least-privilege API token issuance and autonomous workflow permissions.
   - Strengths: Multi-agent credential containment and granular policy enforcement.

## Key Observations
- Startups distinguish themselves by addressing execution-phase attacks rather than just training-data poisoning.
- Agent tool calling creates a critical attack surface: unconstrained tool execution can lead to unauthorized data exfiltration.
`;

      const artifactResult = await toolRegistry.execute(
        'create_markdown_artifact',
        {
          title: `Research Notes: ${node.title}`,
          filename: `research-notes-${nodeId.split('_').pop() || '1'}.md`,
          content: researchNotesContent,
        },
        toolContext
      );

      if (!artifactResult.ok) {
        throw new AgentError(`Failed to create research notes artifact: ${artifactResult.error}`, true);
      }

      const createdArtifact = artifactResult.data as { artifactId: string; path: string };

      await wait(150, fast, signal);

      // 6. node_completed
      await publish('node_completed', {
        nodeId,
        outputArtifactId: createdArtifact.artifactId,
        summary: `Completed landscape research with 5 vendors cataloged in ${createdArtifact.artifactId}`,
      });

      return {
        status: 'done',
        outputArtifactIds: [createdArtifact.artifactId],
        messages,
        usage: {
          inputTokens: 250,
          outputTokens: 420,
          estimatedCostUsd: 0.0035,
        },
      };
    } catch (err) {
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
