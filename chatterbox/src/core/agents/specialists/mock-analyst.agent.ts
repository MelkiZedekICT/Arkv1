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

export class MockAnalystAgent implements AgentRunner {
  readonly role: AgentRole = 'analyst';

  async run(context: AgentRunContext): Promise<AgentRunResult> {
    const { taskId, nodeId, node, inputArtifacts, signal, toolRegistry, eventBus, artifactService, fast } = context;
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

      // Validation check: must fail if required input artifacts are missing
      if (!inputArtifacts || inputArtifacts.length === 0) {
        throw new AgentError(
          `Analyst requires upstream research artifacts to analyze, but none were provided for node "${node.title}".`,
          false // Permanent input validation error, not transient!
        );
      }

      // 2. agent_message (thought)
      await publish('agent_message', {
        nodeId,
        kind: 'thought',
        content: `Ingesting ${inputArtifacts.length} upstream input artifact(s) to structure competitive dimensions...`,
      });

      await wait(150, fast, signal);

      // 3. tool_call (read_artifact)
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

      await wait(250, fast, signal);

      // 4. agent_message (analysis synthesis)
      await publish('agent_message', {
        nodeId,
        kind: 'result',
        content: `Extracted 4 evaluation vectors: Attack Surface Coverage, Tool Sandboxing, In-Flight Latency, and Identity Governance. Building comparative analysis...`,
      });

      await wait(200, fast, signal);

      // 5. artifact_created (competitive-analysis.md)
      const analysisContent = `# Structured Competitive Analysis: AI-Agent Security Startups

**Node**: ${node.title}
**Input Source**: ${targetInputArtifact.title} (${targetInputArtifact.id})
**Timestamp**: ${getTimestamp()}
**Author**: ${actorId}

## Dimensional Breakdown

| Company | Core Security Domain | Architecture Vector | Primary Moat | Integration Latency |
| :--- | :--- | :--- | :--- | :--- |
| **PromptArmor** | Prompt Injection Defense | In-Line Proxy / Traps | Dynamic honeypot generation | <15ms |
| **Lakera AI** | Multi-Agent Application Firewall | Low-latency API Gate | Massive real-world injection dataset | <10ms |
| **Robust Intelligence** | Automated Red-Teaming | Continuous Testing Engine | Algorithmic fuzzing & test suites | Offline / Pre-flight |
| **HiddenLayer** | AI MLSecOps / EDR | Host & Payload Telemetry | Model asset scanning & EDR agent | <25ms |
| **Apex Security** | Agent IAM & Permissions | Tool Policy Engine | Ephemeral credential scoping | <5ms |

## Critical Industry Findings
1. **Tool Invocation Is the Weakest Link**: Autonomous agents capable of calling APIs (SQL, shell, email, web) lack least-privilege scoping in 85% of baseline frameworks.
2. **Dual-Layer Defense Emerging**: Leading enterprises deploy Lakera or PromptArmor as in-line proxies while utilizing Robust Intelligence for continuous regression red-teaming.
3. **Identity White Space**: Only Apex Security is directly treating multi-agent orchestrators as machine identities with temporary scoped privileges.
`;

      const createResult = await toolRegistry.execute(
        'create_markdown_artifact',
        {
          title: `Competitive Analysis: ${node.title}`,
          filename: `competitive-analysis-${nodeId.split('_').pop() || '1'}.md`,
          content: analysisContent,
        },
        toolContext
      );

      if (!createResult.ok) {
        throw new AgentError(`Failed to create analysis artifact: ${createResult.error}`, true);
      }

      const createdArtifact = createResult.data as { artifactId: string; path: string };

      await wait(150, fast, signal);

      // 6. node_completed
      await publish('node_completed', {
        nodeId,
        outputArtifactId: createdArtifact.artifactId,
        summary: `Structured comparison matrix generated in ${createdArtifact.artifactId}`,
      });

      return {
        status: 'done',
        outputArtifactIds: [createdArtifact.artifactId],
        messages,
        usage: {
          inputTokens: 380,
          outputTokens: 490,
          estimatedCostUsd: 0.0042,
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
        usage: { inputTokens: 40, outputTokens: 20 },
        error: agentErr,
      };
    }
  }
}
