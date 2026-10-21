import { TaskNode } from '../../models/task-node.js';
import { Artifact } from '../../models/artifact.js';
import { Message } from '../../models/message.js';
import { redactSensitiveText } from '../../../utils/security.js';

export type AgentContextInput = {
  taskId: string;
  nodeId: string;
  goal: string;
  node: TaskNode;
  upstreamArtifacts: Artifact[];
  priorMessages: Message[];
  userInstructions: string[];
  artifactContents?: Map<string, string>;
  maxInputTokens?: number;
  systemPromptOverride?: string;
};

export type BuiltAgentContext = {
  systemPrompt: string;
  userPrompt: string;
  includedArtifactIds: string[];
  includedMessageIds: string[];
  estimatedInputTokens: number;
};

export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Standard heuristic: ~4 characters per token in English prose/code
  return Math.ceil(text.length / 4);
}

export class AgentContextBuilder {
  private readonly defaultMaxTokens: number;

  constructor(defaultMaxTokens = 12000) {
    this.defaultMaxTokens = defaultMaxTokens;
  }

  build(input: AgentContextInput): BuiltAgentContext {
    const budget = input.maxInputTokens ?? this.defaultMaxTokens;
    const nowUtc = new Date().toISOString();

    // 1. System Prompt definition
    const systemPrompt = input.systemPromptOverride || [
      `You are an autonomous specialist agent operating within the AgentFeed multi-agent orchestration runtime.`,
      `Current UTC Date: ${nowUtc}`,
      `Assigned Role: ${input.node.assignedAgentRole}`,
      `Security Protocol: Never disclose internal API keys, tokens, environment variables, or private authorization headers. Always produce strictly verified, high-quality deliverables.`,
    ].join('\n');

    const systemPromptTokens = estimateTokens(systemPrompt);
    let remainingBudget = budget - systemPromptTokens;

    if (remainingBudget < 500) {
      remainingBudget = 500; // Minimal baseline for essential prompt
    }

    // 2. Priority 1 & 2: Goal, Node Instructions, Acceptance Criteria, User Instructions
    const acceptanceCriteriaList =
      input.node.acceptanceCriteria && input.node.acceptanceCriteria.length > 0
        ? input.node.acceptanceCriteria.map((ac, idx) => `  ${idx + 1}. ${ac}`).join('\n')
        : '  (None specified)';

    const userInstructionsList =
      input.userInstructions && input.userInstructions.length > 0
        ? input.userInstructions.map((ui, idx) => `  ${idx + 1}. ${ui}`).join('\n')
        : '  (None)';

    const coreHeaderSections = [
      `# USER GOAL\n${input.goal}\n`,
      `# ASSIGNED TASK NODE\n- Title: ${input.node.title}\n- Node ID: ${input.node.id}\n- Description: ${input.node.description || 'No description provided.'}\n`,
      `# ACCEPTANCE CRITERIA\n${acceptanceCriteriaList}\n`,
      `# USER INSTRUCTIONS & DECISIONS\n${userInstructionsList}\n`,
    ];

    const coreHeaderText = coreHeaderSections.join('\n');
    const coreHeaderTokens = estimateTokens(coreHeaderText);
    remainingBudget -= coreHeaderTokens;

    // 3. Priority 3: Direct Upstream Dependency Artifacts
    const includedArtifactIds: string[] = [];
    const artifactSections: string[] = [];

    if (input.upstreamArtifacts && input.upstreamArtifacts.length > 0) {
      artifactSections.push('# UPSTREAM ARTIFACTS');

      for (const artifact of input.upstreamArtifacts) {
        const content = input.artifactContents?.get(artifact.id) || '';
        const artifactHeader = `### Artifact: ${artifact.title} (${artifact.id})\nType: ${artifact.type}\nPath: ${artifact.path}\n`;
        const headerTokens = estimateTokens(artifactHeader);

        if (remainingBudget - headerTokens <= 150) {
          // Budget exceeded for more artifacts
          break;
        }

        let body = content;
        let contentTokens = estimateTokens(body);

        // Truncate individual artifact if it alone exceeds available budget
        const maxArtifactBudget = Math.max(200, Math.floor(remainingBudget * 0.7));
        if (contentTokens > maxArtifactBudget) {
          const maxChars = maxArtifactBudget * 4;
          body = body.slice(0, maxChars) + '\n\n[... Truncated for token budget ...]';
          contentTokens = estimateTokens(body);
        }

        artifactSections.push(`${artifactHeader}\n\`\`\`\n${body}\n\`\`\`\n`);
        includedArtifactIds.push(artifact.id);
        remainingBudget -= (headerTokens + contentTokens);
      }
    }

    // 4. Priority 4 & 5: Prior Messages (Prioritize most recent, same-node messages first)
    const includedMessageIds: string[] = [];
    const messageSections: string[] = [];

    if (input.priorMessages && input.priorMessages.length > 0) {
      // Sort: recent messages first
      const sortedMessages = [...input.priorMessages].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      const candidateMessages: Message[] = [];
      for (const msg of sortedMessages) {
        const msgTokens = estimateTokens(msg.content) + 20;
        if (remainingBudget - msgTokens > 100) {
          candidateMessages.push(msg);
          includedMessageIds.push(msg.id);
          remainingBudget -= msgTokens;
        }
      }

      if (candidateMessages.length > 0) {
        // Reverse back to chronological order for prompt presentation
        candidateMessages.reverse();
        messageSections.push('# PRIOR AGENT MESSAGES');
        for (const msg of candidateMessages) {
          messageSections.push(`- [${msg.authorId} (${msg.kind}) at ${msg.createdAt}]: ${msg.content}`);
        }
        messageSections.push('');
      }
    }

    // Assemble final user prompt
    const fullUserPromptParts = [
      coreHeaderText,
      ...artifactSections,
      ...messageSections,
      `# EXECUTION DIRECTIVE\nPlease execute this task carefully according to your role (${input.node.assignedAgentRole}), utilizing upstream artifacts and satisfying all acceptance criteria.`,
    ];

    const rawUserPrompt = fullUserPromptParts.join('\n');
    const sanitizedUserPrompt = redactSensitiveText(rawUserPrompt);
    const sanitizedSystemPrompt = redactSensitiveText(systemPrompt);

    const totalEstimatedTokens =
      estimateTokens(sanitizedSystemPrompt) + estimateTokens(sanitizedUserPrompt);

    return {
      systemPrompt: sanitizedSystemPrompt,
      userPrompt: sanitizedUserPrompt,
      includedArtifactIds,
      includedMessageIds,
      estimatedInputTokens: totalEstimatedTokens,
    };
  }
}
