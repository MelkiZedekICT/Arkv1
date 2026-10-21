import { TaskNode } from '../../models/task-node.js';
import { Artifact } from '../../models/artifact.js';
import { AgentRole } from '../../models/enums.js';
import { LlmProvider, LlmUsage } from '../../llm/types.js';
import { ToolRegistry } from '../../tools/tool.interface.js';
import { EventBus } from '../../events/event-bus.js';
import { AgentFeedEvent } from '../../events/event-types.js';
import { ArtifactService } from '../../artifacts/artifact.service.js';

export class AgentError extends Error {
  readonly isTransient: boolean;

  constructor(message: string, isTransient = false) {
    super(message);
    this.name = 'AgentError';
    this.isTransient = isTransient;
  }
}

export type AgentRunContext = {
  taskId: string;
  nodeId: string;
  goal: string;
  taskTitle: string;
  node: TaskNode;
  inputArtifacts: Artifact[];
  dependencies: TaskNode[];
  signal: AbortSignal;
  llmProvider: LlmProvider;
  toolRegistry: ToolRegistry;
  eventBus: EventBus;
  artifactService: ArtifactService;
  fast?: boolean;
  maxInputTokens?: number;
  noStream?: boolean;
  model?: string;
  userInstructions?: string[];
  workspaceRoot?: string;
  mode?: 'read-only' | 'workspace-write' | 'supervised';
};

export type AgentRunResult = {
  status: 'done' | 'failed' | 'blocked';
  outputArtifactIds: string[];
  messages: AgentFeedEvent[];
  usage: LlmUsage;
  error?: AgentError;
};

export interface AgentRunner {
  readonly role: AgentRole;
  run(context: AgentRunContext): Promise<AgentRunResult>;
}
