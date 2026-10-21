import { useState, useEffect } from 'react';
import { EventBus } from '../../core/events/event-bus.js';
import { AgentFeedEvent } from '../../core/events/event-types.js';

export interface FeedItem {
  id: string;
  timestamp: string;
  type: string;
  actorType: string;
  actorId: string;
  role: string;
  content: string;
  kind?: string;
}

export interface TaskNodeState {
  id: string;
  title: string;
  assignedAgentRole: string;
  status: string;
}

export interface PendingApprovalState {
  approvalId: string;
  action: string;
  riskLevel: 'low' | 'medium' | 'high';
  agentRole?: string;
  target?: string;
  targetPath?: string;
  command?: string;
  diffSnippet?: string;
  reason?: string;
  changesetId?: string;
  description?: string;
  impact?: string;
  filesCount?: number;
  linesAdded?: number;
  linesRemoved?: number;
  mode?: string;
}

export interface ArtifactState {
  artifactId: string;
  title: string;
  type: string;
  path: string;
}

export interface ProposedPlanTaskState {
  id: string;
  title: string;
  description: string;
  assignedAgentRole: string;
  dependsOn: string[];
  acceptanceCriteria: string[];
  estimatedEffort?: string;
}

export interface ProposedPlanState {
  title: string;
  summary: string;
  assumptions: string[];
  risks: string[];
  tasks: ProposedPlanTaskState[];
}

export interface ChangesetDiffItem {
  filePath: string;
  changeType: 'create' | 'edit' | 'delete';
  additions: number;
  deletions: number;
  diffSnippet: string;
}

export interface ActiveChangesetState {
  changesetId: string;
  filesCount: number;
  additions: number;
  deletions: number;
  summary?: string;
  status: 'proposed' | 'awaiting_approval' | 'approved' | 'rejected' | 'applied' | 'failed' | 'stale';
  mode?: string;
  riskLevel?: string;
  staleFiles?: string[];
  diffs: ChangesetDiffItem[];
}

export interface AgentFeedUIState {
  taskId: string;
  taskTitle: string;
  taskGoal: string;
  taskStatus: string;
  workspaceRoot?: string;
  mode?: string;
  gitInfo?: {
    isGitRepo?: boolean;
    branch?: string;
    headCommit?: string;
  };
  nodes: TaskNodeState[];
  feedItems: FeedItem[];
  pendingApproval: PendingApprovalState | null;
  proposedPlan: ProposedPlanState | null;
  planDecision: 'awaiting_decision' | 'approved' | 'rejected' | 'revising' | null;
  latestArtifact: ArtifactState | null;
  artifacts: ArtifactState[];
  latestDiff?: string;
  activeChangeset: ActiveChangesetState | null;
  eventCount: number;
  estimatedCost: number;
  isPaused: boolean;
  isCompleted: boolean;
  plannerPhase?: string;
}


const MAX_FEED_ITEMS = 200;

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    const ss = d.getSeconds().toString().padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  } catch {
    return '00:00:00';
  }
}

function resolveRole(actorId: string, actorType: string): string {
  if (actorType === 'user') return 'user';
  if (actorType === 'system') return 'system';
  if (actorId.startsWith('agent_')) {
    return actorId.replace('agent_', '');
  }
  return actorId;
}

export function useAgentFeedEvents(eventBus: EventBus): AgentFeedUIState {
  const [state, setState] = useState<AgentFeedUIState>({
    taskId: '',
    taskTitle: 'Initializing...',
    taskGoal: '',
    taskStatus: 'pending',
    workspaceRoot: undefined,
    mode: undefined,
    gitInfo: undefined,
    latestDiff: undefined,
    activeChangeset: null,
    nodes: [],
    feedItems: [],
    pendingApproval: null,
    proposedPlan: null,
    planDecision: null,
    latestArtifact: null,
    artifacts: [],
    eventCount: 0,
    estimatedCost: 0,
    isPaused: false,
    isCompleted: false,
    plannerPhase: undefined,
  });

  useEffect(() => {
    const unsubscribe = eventBus.subscribe('*', (event: AgentFeedEvent) => {
      setState((prev) => {
        let nextStatus = prev.taskStatus;
        let nextTitle = prev.taskTitle;
        let nextGoal = prev.taskGoal;
        let nextTaskId = prev.taskId || event.taskId;
        let nextWorkspaceRoot = prev.workspaceRoot;
        let nextMode = prev.mode;
        let nextGitInfo = prev.gitInfo;
        let nextLatestDiff = prev.latestDiff;
        let nextActiveChangeset = prev.activeChangeset;
        let nextNodes = [...prev.nodes];

        let nextPendingApproval = prev.pendingApproval;
        let nextProposedPlan = prev.proposedPlan;
        let nextPlanDecision = prev.planDecision;
        let nextPlannerPhase = prev.plannerPhase;
        let nextEstimatedCost = prev.estimatedCost;
        let nextArtifact = prev.latestArtifact;
        const nextArtifacts = [...prev.artifacts];
        let nextIsPaused = prev.isPaused;
        let nextIsCompleted = prev.isCompleted;
        const newFeedItems = [...prev.feedItems];

        const formattedTime = formatTime(event.timestamp);
        const role = resolveRole(event.actorId, event.actorType);

        switch (event.type) {
          case 'task_created': {
            nextStatus = 'draft';
            nextTitle = (event.payload.title as string) || prev.taskTitle;
            nextGoal = (event.payload.goal as string) || prev.taskGoal;
            nextTaskId = event.taskId;
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: event.actorType,
              actorId: event.actorId,
              role: 'system',
              content: `Task created: "${nextTitle}"`,
            });
            break;
          }

          case 'planner_started': {
            nextStatus = 'planning';
            nextPlannerPhase = 'understanding';
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'agent',
              actorId: 'agent_planner',
              role: 'planner',
              content: `Planner agent activated (${(event.payload.provider as string) || 'llm'})`,
            });
            break;
          }

          case 'planner_message': {
            if (event.payload.phase) {
              nextPlannerPhase = event.payload.phase as string;
            }
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'agent',
              actorId: 'agent_planner',
              role: 'planner',
              content: event.payload.content as string,
            });
            break;
          }

          case 'planner_response_received': {
            const usage = event.payload.usage as { estimatedCostUsd?: number } | undefined;
            if (usage?.estimatedCostUsd) {
              nextEstimatedCost = Math.round((nextEstimatedCost + usage.estimatedCostUsd) * 100_000) / 100_000;
            }
            break;
          }

          case 'plan_validation_failed': {
            const errors = (event.payload.errors as string[]) || [];
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'agent',
              actorId: 'agent_planner',
              role: 'planner',
              content: `Plan validation issue (attempt ${event.payload.attempt}): ${errors.slice(0, 2).join('; ')}`,
            });
            break;
          }

          case 'plan_proposed': {
            nextStatus = 'awaiting_approval';
            nextPlanDecision = 'awaiting_decision';
            const rawNodes = (event.payload.nodes as Array<Record<string, unknown>>) || [];
            const planTasks = rawNodes.map((n) => ({
              id: (n.id as string) || 'task',
              title: (n.title as string) || '',
              description: (n.description as string) || '',
              assignedAgentRole: (n.assignedAgentRole as string) || 'researcher',
              dependsOn: (n.dependsOn as string[]) || [],
              acceptanceCriteria: (n.acceptanceCriteria as string[]) || [],
              estimatedEffort: (n.estimatedEffort as string) || 'medium',
            }));

            nextProposedPlan = {
              title: (event.payload.title as string) || prev.taskTitle,
              summary: (event.payload.summary as string) || 'Proposed task execution graph.',
              assumptions: (event.payload.assumptions as string[]) || [],
              risks: (event.payload.risks as string[]) || [],
              tasks: planTasks,
            };

            // Update visible graph nodes
            nextNodes = planTasks.map((t) => ({
              id: t.id,
              title: t.title,
              assignedAgentRole: t.assignedAgentRole,
              status: 'pending',
            }));

            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'agent',
              actorId: 'agent_planner',
              role: 'planner',
              content: `Proposed plan: "${nextProposedPlan.title}" with ${planTasks.length} tasks.`,
            });
            break;
          }

          case 'plan_approved': {
            nextPlanDecision = 'approved';
            nextStatus = 'ready';
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'user',
              actorId: 'user_local',
              role: 'user',
              content: `[PLAN APPROVED] Plan signed off by ${event.payload.approvedBy}. Starting execution engine...`,
            });
            break;
          }

          case 'plan_rejected': {
            nextPlanDecision = 'rejected';
            nextStatus = 'failed';
            nextIsCompleted = true;
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'user',
              actorId: 'user_local',
              role: 'user',
              content: `[PLAN REJECTED] Operator rejected plan: ${event.payload.reason}`,
            });
            break;
          }

          case 'plan_revision_requested': {
            nextPlanDecision = 'revising';
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'user',
              actorId: 'user_local',
              role: 'user',
              content: `[REVISION REQUESTED] Feedback: "${event.payload.feedback}"`,
            });
            break;
          }

          case 'node_created': {
            const nodeId = event.payload.nodeId as string;
            if (!nextNodes.some((n) => n.id === nodeId)) {
              nextNodes.push({
                id: nodeId,
                title: event.payload.title as string,
                assignedAgentRole: event.payload.assignedAgentRole as string,
                status: 'pending',
              });
            }
            break;
          }

          case 'node_started': {
            nextStatus = 'running';
            const nodeId = event.payload.nodeId as string;
            nextNodes = nextNodes.map((n) =>
              n.id === nodeId ? { ...n, status: 'running' } : n
            );
            break;
          }

          case 'node_completed': {
            const nodeId = event.payload.nodeId as string;
            nextNodes = nextNodes.map((n) =>
              n.id === nodeId ? { ...n, status: 'done' } : n
            );
            break;
          }

          case 'node_failed': {
            const nodeId = event.payload.nodeId as string;
            nextNodes = nextNodes.map((n) =>
              n.id === nodeId ? { ...n, status: 'failed' } : n
            );
            break;
          }

          case 'agent_message': {
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: event.actorType,
              actorId: event.actorId,
              role,
              content: event.payload.content as string,
            });
            break;
          }

          case 'agent_reply': {
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: event.actorType,
              actorId: event.actorId,
              role,
              content: event.payload.content as string,
            });
            break;
          }

          case 'context_built': {
            const bud = event.payload.inputTokenBudget;
            const est = event.payload.estimatedInputTokens;
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: event.actorType,
              actorId: event.actorId,
              role,
              content: `Context assembled (${est} tokens est. / ${bud} max)`,
            });
            break;
          }

          case 'llm_call_started': {
            const isStream = event.payload.isStreaming ? 'streaming' : 'non-streaming';
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: event.actorType,
              actorId: event.actorId,
              role,
              content: `LLM query started (${event.payload.model}, ${isStream})...`,
            });
            break;
          }

          case 'llm_progress': {
            const lastIdx = newFeedItems.length - 1;
            const delta = (event.payload.deltaText as string) || '';
            const activity = (event.payload.activity as string) || '';
            const displayText = activity || (delta.length > 60 ? `${delta.slice(0, 57)}...` : delta);

            if (displayText && displayText.trim().length > 0) {
              if (
                lastIdx >= 0 &&
                newFeedItems[lastIdx].type === 'llm_progress' &&
                newFeedItems[lastIdx].actorId === event.actorId
              ) {
                const prevContent = newFeedItems[lastIdx].content;
                const combined = prevContent.includes('Generating: ')
                  ? (prevContent + ' ' + displayText.trim()).slice(0, 80)
                  : `Generating: ${displayText.trim()}`.slice(0, 80);
                newFeedItems[lastIdx] = {
                  ...newFeedItems[lastIdx],
                  content: combined,
                };
              } else {
                newFeedItems.push({
                  id: event.eventId,
                  timestamp: formattedTime,
                  type: event.type,
                  actorType: event.actorType,
                  actorId: event.actorId,
                  role,
                  content: `Generating: ${displayText.trim().slice(0, 80)}`,
                });
              }
            }
            break;
          }

          case 'llm_call_completed': {
            const usage = event.payload.usage as
              | { estimatedCostUsd?: number; inputTokens?: number; outputTokens?: number }
              | undefined;
            if (usage?.estimatedCostUsd) {
              nextEstimatedCost =
                Math.round((nextEstimatedCost + usage.estimatedCostUsd) * 100_000) / 100_000;
            }
            const totalTok = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: event.actorType,
              actorId: event.actorId,
              role,
              content: `LLM response received in ${event.payload.latencyMs}ms (${totalTok} tok)`,
            });
            break;
          }

          case 'tool_call_started': {
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'system',
              actorId: 'system',
              role: 'system',
              content: `Tool call started: ${event.payload.toolName}`,
            });
            break;
          }

          case 'tool_call_completed': {
            const dur = event.payload.durationMs ? ` (${event.payload.durationMs}ms)` : '';
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'system',
              actorId: 'system',
              role: 'system',
              content: `Tool completed: ${event.payload.toolName}${dur}`,
            });
            break;
          }

          case 'artifact_created': {
            nextArtifact = {
              artifactId: event.payload.artifactId as string,
              title: event.payload.title as string,
              type: event.payload.type as string,
              path: event.payload.path as string,
            };
            nextArtifacts.push(nextArtifact);
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: event.actorType,
              actorId: event.actorId,
              role,
              content: `Created artifact: ${event.payload.title} (${event.payload.type})`,
            });
            break;
          }

          case 'approval_requested': {
            nextPendingApproval = {
              approvalId: event.payload.approvalId as string,
              action: event.payload.action as string,
              riskLevel: (event.payload.riskLevel as 'low' | 'medium' | 'high') || 'medium',
              agentRole: (event.payload.agentRole as string) || role,
              target: event.payload.target as string,
              targetPath: (event.payload.targetPath as string) || (event.payload.target as string),
              command: event.payload.command as string,
              diffSnippet: event.payload.diffSnippet as string,
              reason: event.payload.reason as string,
            };
            if (event.payload.diffSnippet) {
              nextLatestDiff = event.payload.diffSnippet as string;
            }
            const nodeId = event.payload.nodeId as string;
            if (nodeId) {
              nextNodes = nextNodes.map((n) =>
                n.id === nodeId ? { ...n, status: 'awaiting_approval' } : n
              );
            }
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: event.actorType,
              actorId: event.actorId,
              role,
              content: `⚠️ Approval required: ${event.payload.action} (${nextPendingApproval.riskLevel} risk)`,
            });
            break;
          }

          case 'approval_granted': {
            nextPendingApproval = null;
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'user',
              actorId: 'user_local',
              role: 'user',
              content: `[APPROVED] Action confirmed by human operator`,
            });
            break;
          }

          case 'approval_denied': {
            nextPendingApproval = null;
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'user',
              actorId: 'user_local',
              role: 'user',
              content: `[REJECTED] Action denied by human operator`,
            });
            break;
          }

          case 'task_paused': {
            nextIsPaused = true;
            nextStatus = 'paused';
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'system',
              actorId: 'system',
              role: 'system',
              content: `Task paused by operator`,
            });
            break;
          }

          case 'task_resumed': {
            nextIsPaused = false;
            nextStatus = 'running';
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'system',
              actorId: 'system',
              role: 'system',
              content: `Task resumed`,
            });
            break;
          }

          case 'task_updated': {
            const status = event.payload.status as string | undefined;
            if (status) {
              nextStatus = status;
              if (status === 'done' || status === 'failed' || status === 'cancelled') {
                nextIsCompleted = true;
              }
            }
            break;
          }

          case 'node_retry_scheduled': {
            const nodeId = event.payload.nodeId as string;
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'system',
              actorId: 'system',
              role: 'system',
              content: `[RETRY SCHEDULED] Node ${nodeId} attempt ${event.payload.attempt}/${event.payload.maxAttempts} in ${event.payload.delayMs}ms (${event.payload.error})`,
            });
            break;
          }

          case 'node_retry_started': {
            const nodeId = event.payload.nodeId as string;
            nextNodes = nextNodes.map((n) =>
              n.id === nodeId ? { ...n, status: 'running' } : n
            );
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'system',
              actorId: 'system',
              role: 'system',
              content: `[RETRY STARTED] Retrying node ${nodeId} (attempt ${event.payload.attempt}/${event.payload.maxAttempts})`,
            });
            break;
          }

          case 'node_retry_exhausted': {
            const nodeId = event.payload.nodeId as string;
            nextNodes = nextNodes.map((n) =>
              n.id === nodeId ? { ...n, status: 'failed' } : n
            );
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'system',
              actorId: 'system',
              role: 'system',
              content: `[RETRY EXHAUSTED] Node ${nodeId} failed after ${event.payload.attempts} attempts: ${event.payload.error}`,
            });
            break;
          }

          case 'error_occurred': {
            const nodeId = event.payload.nodeId as string | undefined;
            if (nodeId) {
              const errText = (event.payload.error as string) || '';
              const isBlocked = errText.toLowerCase().includes('blocked');
              nextNodes = nextNodes.map((n) =>
                n.id === nodeId ? { ...n, status: isBlocked ? 'blocked' : 'failed' } : n
              );
            }
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: event.actorType,
              actorId: event.actorId,
              role: 'system',
              content: `[ERROR] ${event.payload.error as string}`,
            });
            break;
          }

          case 'user_instruction': {
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'user',
              actorId: 'operator',
              role: 'user',
              content: `[User Instruction] @${event.payload.agentRole || 'agent'}: ${event.payload.instruction}`,
            });
            break;
          }

          case 'permission_checked': {
            const allowed = Boolean(event.payload.allowed);
            if (!allowed) {
              newFeedItems.push({
                id: event.eventId,
                timestamp: formattedTime,
                type: event.type,
                actorType: 'system',
                actorId: 'perm_guard',
                role: 'system',
                content: `❌ Permission denied: ${event.payload.permission} (${event.payload.reason})`,
              });
            }
            break;
          }

          case 'run_started': {
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'system',
              actorId: 'scheduler',
              role: 'system',
              content: `Run started (${event.payload.mode}${event.payload.isResume ? ', resumed' : ''})`,
            });
            break;
          }

          case 'run_interrupted': {
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'system',
              actorId: 'crash_recovery',
              role: 'system',
              content: `Run interrupted: ${event.payload.reason}`,
            });
            break;
          }

          case 'run_recovered': {
            const rec = (event.payload.recoveredNodeIds as string[]) || [];
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'system',
              actorId: 'crash_recovery',
              role: 'system',
              content: `Run recovered (${rec.length} nodes scheduled for re-execution)`,
            });
            break;
          }

          case 'checkpoint_saved': {
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'system',
              actorId: 'checkpoint_service',
              role: 'system',
              content: `Checkpoint saved (${event.payload.checkpointId})`,
            });
            break;
          }

          case 'task_completed': {
            nextStatus = 'done';
            nextIsCompleted = true;
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'system',
              actorId: 'system',
              role: 'system',
              content: `Task completed successfully!`,
            });
            break;
          }

          case 'workspace_opened': {
            nextWorkspaceRoot = event.payload.workspaceRoot as string;
            nextMode = event.payload.mode as string;
            nextGitInfo = {
              isGitRepo: Boolean(event.payload.isGitRepo),
              branch: event.payload.branch as string | undefined,
              headCommit: event.payload.headCommit as string | undefined,
            };
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: event.actorType,
              actorId: event.actorId,
              role: 'system',
              content: `Workspace opened: ${event.payload.workspaceRoot} (${event.payload.mode} mode)`,
            });
            break;
          }

          case 'workspace_mode_set': {
            nextMode = event.payload.mode as string;
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: event.actorType,
              actorId: event.actorId,
              role: 'system',
              content: `Workspace mode set to: ${event.payload.mode}`,
            });
            break;
          }

          case 'folder_create_proposed': {
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: event.actorType,
              actorId: event.actorId,
              role,
              content: `[FOLDER PROPOSED] Directory: ${event.payload.path}`,
            });
            break;
          }

          case 'file_create_proposed': {
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: event.actorType,
              actorId: event.actorId,
              role,
              content: `[FILE PROPOSED] Create: ${event.payload.path}`,
            });
            break;
          }

          case 'file_edit_proposed': {
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: event.actorType,
              actorId: event.actorId,
              role,
              content: `[FILE PROPOSED] Edit: ${event.payload.path}`,
            });
            break;
          }

          case 'file_delete_proposed': {
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: event.actorType,
              actorId: event.actorId,
              role,
              content: `[FILE PROPOSED] Delete: ${event.payload.path}`,
            });
            break;
          }

          case 'diff_proposed': {
            nextLatestDiff = event.payload.diff as string;
            const add = event.payload.additions ?? 0;
            const del = event.payload.deletions ?? 0;
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: event.actorType,
              actorId: event.actorId,
              role,
              content: `[DIFF PROPOSED] ${event.payload.path} (+${add}/-${del})`,
            });
            break;
          }

          case 'diff_approved': {
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'user',
              actorId: 'user_local',
              role: 'user',
              content: `[DIFF APPROVED] Change to ${event.payload.path} approved`,
            });
            break;
          }

          case 'diff_rejected': {
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'user',
              actorId: 'user_local',
              role: 'user',
              content: `[DIFF REJECTED] Change to ${event.payload.path} rejected: ${event.payload.reason}`,
            });
            break;
          }

          case 'changeset_proposed': {
            const rawDiffs = (event.payload.diffs as Array<Record<string, unknown>>) || [];
            const diffItems: ChangesetDiffItem[] = rawDiffs.map((d) => ({
              filePath: (d.filePath as string) || 'file',
              changeType: (d.changeType as 'create' | 'edit' | 'delete') || 'edit',
              additions: (d.additions as number) || 0,
              deletions: (d.deletions as number) || 0,
              diffSnippet: (d.unifiedDiff as string) || '',
            }));

            const changesetId = (event.payload.changesetId as string) || 'cset';
            const count = (event.payload.filesCount as number) || diffItems.length;
            const add = (event.payload.additions as number) || diffItems.reduce((acc, d) => acc + d.additions, 0);
            const del = (event.payload.deletions as number) || diffItems.reduce((acc, d) => acc + d.deletions, 0);

            nextActiveChangeset = {
              changesetId,
              filesCount: count,
              additions: add,
              deletions: del,
              summary: event.payload.summary as string | undefined,
              status: 'proposed',
              mode: prev.mode,
              riskLevel: (event.payload.riskLevel as string) || 'medium',
              diffs: diffItems,
            };

            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: event.actorType,
              actorId: event.actorId,
              role,
              content: `[CHANGESET PROPOSED] ${changesetId} · ${count} files · +${add} / -${del}`,
            });
            break;
          }

          case 'changeset_approved': {
            if (nextActiveChangeset) {
              nextActiveChangeset = { ...nextActiveChangeset, status: 'approved' };
            }
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'user',
              actorId: event.actorId,
              role: 'user',
              content: `[CHANGESET APPROVED] Changeset ${event.payload.changesetId} approved`,
            });
            break;
          }

          case 'changeset_rejected': {
            if (nextActiveChangeset) {
              nextActiveChangeset = { ...nextActiveChangeset, status: 'rejected' };
            }
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'user',
              actorId: event.actorId,
              role: 'user',
              content: `[CHANGESET REJECTED] Changeset ${event.payload.changesetId} rejected: ${event.payload.reason || 'by operator'}`,
            });
            break;
          }

          case 'changeset_applied': {
            if (nextActiveChangeset) {
              nextActiveChangeset = { ...nextActiveChangeset, status: 'applied' };
            }
            const files = (event.payload.appliedFiles as string[]) || [];
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'user',
              actorId: event.actorId,
              role: 'user',
              content: `[CHANGESET APPLIED] Successfully applied ${files.length} files`,
            });
            break;
          }

          case 'changeset_stale': {
            const staleFiles = (event.payload.staleFiles as string[]) || [];
            if (nextActiveChangeset) {
              nextActiveChangeset = {
                ...nextActiveChangeset,
                status: 'stale',
                staleFiles,
              };
            }
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'system',
              actorId: 'stale_detector',
              role: 'system',
              content: `⚠️ [CHANGESET STALE] Files changed after proposal: ${staleFiles.join(', ')}`,
            });
            break;
          }

          case 'changeset_failed': {
            if (nextActiveChangeset) {
              nextActiveChangeset = { ...nextActiveChangeset, status: 'failed' };
            }
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'system',
              actorId: 'workspace_transaction',
              role: 'system',
              content: `[CHANGESET FAILED] ${event.payload.error}`,
            });
            break;
          }

          case 'file_backup_created': {
            const files = (event.payload.backedUpFiles as string[]) || [];
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'system',
              actorId: 'workspace_transaction',
              role: 'system',
              content: `Backup created for ${files.length} files in ${event.payload.backupDir}`,
            });
            break;
          }

          case 'file_rollback_completed': {
            const files = (event.payload.restoredFiles as string[]) || [];
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'system',
              actorId: 'workspace_transaction',
              role: 'system',
              content: `Rollback completed: restored ${files.length} files from backup`,
            });
            break;
          }


          case 'command_proposed': {
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: event.actorType,
              actorId: event.actorId,
              role,
              content: `[COMMAND PROPOSED] ${event.payload.command}`,
            });
            break;
          }

          case 'command_approved': {
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'user',
              actorId: 'user_local',
              role: 'user',
              content: `[COMMAND APPROVED] ${event.payload.command}`,
            });
            break;
          }

          case 'command_rejected': {
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'user',
              actorId: 'user_local',
              role: 'user',
              content: `[COMMAND REJECTED] ${event.payload.command}: ${event.payload.reason}`,
            });
            break;
          }

          case 'change_summary_created': {
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: event.actorType,
              actorId: event.actorId,
              role,
              content: `[CHANGE SUMMARY] Created ${event.payload.path}`,
            });
            break;
          }
        }

        // Keep buffer bounded
        const trimmedFeed =
          newFeedItems.length > MAX_FEED_ITEMS
            ? newFeedItems.slice(newFeedItems.length - MAX_FEED_ITEMS)
            : newFeedItems;

        return {
          ...prev,
          taskId: nextTaskId,
          taskTitle: nextTitle,
          taskGoal: nextGoal,
          taskStatus: nextStatus,
          workspaceRoot: nextWorkspaceRoot,
          mode: nextMode,
          gitInfo: nextGitInfo,
          nodes: nextNodes,
          feedItems: trimmedFeed,
          pendingApproval: nextPendingApproval,
          proposedPlan: nextProposedPlan,
          planDecision: nextPlanDecision,
          plannerPhase: nextPlannerPhase,
          latestArtifact: nextArtifact,
          artifacts: nextArtifacts,
          latestDiff: nextLatestDiff,
          activeChangeset: nextActiveChangeset,
          eventCount: prev.eventCount + 1,
          estimatedCost: nextEstimatedCost,
          isPaused: nextIsPaused,
          isCompleted: nextIsCompleted,
        };
      });
    });

    return () => {
      unsubscribe();
    };
  }, [eventBus]);

  return state;
}
