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

export interface AgentFeedUIState {
  taskId: string;
  taskTitle: string;
  taskGoal: string;
  taskStatus: string;
  nodes: TaskNodeState[];
  feedItems: FeedItem[];
  pendingApproval: PendingApprovalState | null;
  proposedPlan: ProposedPlanState | null;
  planDecision: 'awaiting_decision' | 'approved' | 'rejected' | 'revising' | null;
  latestArtifact: ArtifactState | null;
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
    nodes: [],
    feedItems: [],
    pendingApproval: null,
    proposedPlan: null,
    planDecision: null,
    latestArtifact: null,
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
        let nextNodes = [...prev.nodes];
        let nextPendingApproval = prev.pendingApproval;
        let nextProposedPlan = prev.proposedPlan;
        let nextPlanDecision = prev.planDecision;
        let nextPlannerPhase = prev.plannerPhase;
        let nextEstimatedCost = prev.estimatedCost;
        let nextArtifact = prev.latestArtifact;
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
            nextIsCompleted = true;
            newFeedItems.push({
              id: event.eventId,
              timestamp: formattedTime,
              type: event.type,
              actorType: 'user',
              actorId: 'user_local',
              role: 'user',
              content: `[PLAN APPROVED] Plan signed off by ${event.payload.approvedBy}. Ready for execution (Milestone 5).`,
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
            };
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
              content: `Approval required: ${event.payload.action}`,
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
          nodes: nextNodes,
          feedItems: trimmedFeed,
          pendingApproval: nextPendingApproval,
          proposedPlan: nextProposedPlan,
          planDecision: nextPlanDecision,
          plannerPhase: nextPlannerPhase,
          latestArtifact: nextArtifact,
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
