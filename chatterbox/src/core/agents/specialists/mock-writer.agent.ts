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

export class MockWriterAgent implements AgentRunner {
  readonly role: AgentRole = 'writer';

  async run(context: AgentRunContext): Promise<AgentRunResult> {
    const { taskId, nodeId, goal, taskTitle, node, inputArtifacts, signal, toolRegistry, eventBus, artifactService, fast } = context;
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
        content: `Gathering upstream research & analysis artifacts to draft the comprehensive executive deliverable...`,
      });

      await wait(150, fast, signal);

      const toolContext = {
        taskId,
        nodeId,
        actorId,
        correlationId,
        artifactService,
        eventBus,
      };

      // 3. tool_call (read_artifact for any input artifacts)
      if (inputArtifacts && inputArtifacts.length > 0) {
        for (const inputArt of inputArtifacts.slice(0, 2)) {
          await toolRegistry.execute('read_artifact', { artifactId: inputArt.id }, toolContext);
        }
      }

      await wait(250, fast, signal);

      // 4. agent_message (drafting notice)
      await publish('agent_message', {
        nodeId,
        kind: 'thought',
        content: `Drafting formal competitive brief deliverable with executive summary, comparison matrix, strategic gaps, and recommendations...`,
      });

      await wait(250, fast, signal);

      // 5. artifact_created: competitive-brief.md with all required sections:
      // - Title
      // - Executive summary
      // - Comparison table
      // - Key findings
      // - Gaps
      // - Recommendations
      // - Sources
      const briefContent = `# Competitive Brief: AI-Agent Security Startups

**Goal**: ${goal}
**Task**: ${taskTitle}
**Published**: ${getTimestamp()}
**Author**: AgentFeed Specialist Writer Team

---

## Executive Summary
As autonomous AI agents shift from passive question-answering assistants to agentic workflows with broad execution privileges, runtime security and containment have emerged as a critical cybersecurity tier. This brief evaluates the emerging competitive startup landscape addressing model integrity, prompt injection traps, autonomous tool containment, and agent identity management. Startups demonstrating sub-15ms inline interception and granular least-privilege scoping represent the highest enterprise value propositions.

---

## Comparison Table

| Startup | Primary Category | Architecture Model | Key Strengths | Latency Overhead | Funding Stage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **PromptArmor** | Runtime Guardrails | Inline reverse-proxy & honeypots | Zero-day prompt injection traps; real-time tool parameter checking | ~12ms | Seed ($8M) |
| **Lakera AI** | Agent Firewall | Low-latency API shield | World-class injection dataset; multi-modal payload filtering | <10ms | Series A ($30M) |
| **Robust Intelligence** | Security Validation | Continuous automated red-teaming | Algorithmic vulnerability fuzzing; benchmark auditing | Pre-flight | Series B ($44M) |
| **HiddenLayer** | AI MLSecOps / EDR | Agent EDR sensor | Host telemetry and model supply-chain vulnerability inspection | ~20ms | Series A ($50M) |
| **Apex Security** | Agent IAM & Scoping | Ephemeral token governor | Dynamic tool credential down-scoping; prevents privilege creep | <5ms | Seed ($7M) |

---

## Key Findings
1. **The Tool Execution Vulnerability**: 82% of reported multi-agent vulnerabilities stem not from direct prompt manipulation, but from unconstrained tool arguments (e.g. unintended SQL commands or file read invocations).
2. **Speed Dictates Adoption**: In enterprise agent loops executing 10+ sequential reasoning steps, security inspection latency greater than 30ms degrades user experience unacceptably. Lakera and Apex lead latency benchmarks.
3. **Consolidation Pressures**: Platform vendors are currently acquiring point-solution red-teaming startups (e.g., Cisco acquiring Robust Intelligence), creating demand for specialized runtime governance vendors.

---

## Gaps
- **Cross-Agent Identity Trust**: Current solutions focus on single agent-to-tool boundaries rather than multi-agent cascading delegations.
- **Stateful Context Memory Poisoning**: Limited defense exists today against adversarial memory poisoning across long-term vector store sessions.
- **Deterministic Sandboxing**: Software-only guardrails still fail edge cases; hardware or micro-VM isolation layers are still nascent in market offerings.

---

## Recommendations
1. **Implement Dual-Layer Architecture**: Combine continuous pre-deployment red-teaming with low-latency in-flight proxy filters.
2. **Enforce Ephemeral Tool Tokens**: Ensure agents never hold persistent root credentials; mandate per-call ephemeral tool scoping.
3. **Log Full Causal Provenance**: Maintain auditable event stores recording every reasoning thought, tool input, and parameter hash for post-incident forensics.

---

## Sources
- PromptArmor Enterprise Technical Whitepaper (2025)
- Lakera AI Threat Intelligence & Benchmark Report (Q4 2025)
- Robust Intelligence Multi-Agent Fuzzing Studies (2024-2025)
- OWASP Top 10 for Large Language Model Applications & Autonomous Agents
- HiddenLayer AI Threat Landscape Survey
`;

      const createResult = await toolRegistry.execute(
        'create_markdown_artifact',
        {
          title: 'Competitive Brief: AI-Agent Security Startups',
          filename: 'competitive-brief.md',
          content: briefContent,
        },
        toolContext
      );

      if (!createResult.ok) {
        throw new AgentError(`Failed to save competitive brief artifact: ${createResult.error}`, true);
      }

      const createdArtifact = createResult.data as { artifactId: string; path: string };

      await wait(150, fast, signal);

      // 6. agent_message (result)
      await publish('agent_message', {
        nodeId,
        kind: 'result',
        content: `Competitive brief compiled and saved to ${createdArtifact.path}`,
      });

      // 7. node_completed
      await publish('node_completed', {
        nodeId,
        outputArtifactId: createdArtifact.artifactId,
        summary: `Drafted final competitive brief artifact (${createdArtifact.artifactId})`,
      });

      return {
        status: 'done',
        outputArtifactIds: [createdArtifact.artifactId],
        messages,
        usage: {
          inputTokens: 520,
          outputTokens: 850,
          estimatedCostUsd: 0.0078,
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
        usage: { inputTokens: 50, outputTokens: 25 },
        error: agentErr,
      };
    }
  }
}
