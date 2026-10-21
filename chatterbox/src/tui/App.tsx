import React, { useState } from 'react';
import { Box, useInput, useApp, useStdin } from 'ink';
import { EventBus } from '../core/events/event-bus.js';
import { useAgentFeedEvents, ProposedPlanTaskState } from './hooks/useAgentFeedEvents.js';
import { useElapsedTimer } from './hooks/useElapsedTimer.js';
import { TaskHeader } from './components/TaskHeader.js';
import { AgentFeed } from './components/AgentFeed.js';
import { TaskGraph } from './components/TaskGraph.js';
import { ApprovalPrompt } from './components/ApprovalPrompt.js';
import { ArtifactViewer } from './components/ArtifactViewer.js';
import { DiffViewer } from './components/DiffViewer.js';
import { PlanProposedView } from './components/PlanProposedView.js';
import { MentionPrompt } from './components/MentionPrompt.js';
import { PlanEditPrompt } from './components/PlanEditPrompt.js';
import { TaskCompletedView } from './components/TaskCompletedView.js';
import { StatusBar } from './components/StatusBar.js';
import { HelpOverlay } from './components/HelpOverlay.js';

export interface AppController {
  stop: () => void;
  pause?: () => void;
  resume?: () => void;
  approve?: (approvalId?: string) => void | Promise<void>;
  reject?: (approvalId?: string, reason?: string) => void | Promise<void>;
  approvePlan?: (editedTasks?: ProposedPlanTaskState[]) => void | Promise<void>;
  rejectPlan?: () => void | Promise<void>;
  requestRevision?: (feedback: string) => void | Promise<void>;
  mentionAgent?: (agentRole: string, instruction: string) => void | Promise<void>;
}

export interface AppProps {
  eventBus: EventBus;
  runner: AppController;
  onExit?: () => void;
}

export const App: React.FC<AppProps> = ({ eventBus, runner, onExit }) => {
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();
  const state = useAgentFeedEvents(eventBus);
  const [isViewingArtifact, setIsViewingArtifact] = useState(false);
  const [isViewingDiff, setIsViewingDiff] = useState(false);
  const [isMentioning, setIsMentioning] = useState(false);
  const [isEditingPlan, setIsEditingPlan] = useState(false);
  const [isShowingHelp, setIsShowingHelp] = useState(false);

  const isRunning =
    state.taskStatus === 'running' ||
    state.taskStatus === 'planning' ||
    state.taskStatus === 'awaiting_approval';
  const elapsedTime = useElapsedTimer(isRunning, state.isPaused || state.isCompleted);

  const isAwaitingPlanDecision = Boolean(
    state.proposedPlan && state.planDecision === 'awaiting_decision'
  );

  useInput(
    (input, key) => {
      // Don't intercept single keys if user is typing in mention or edit mode
      if (isMentioning || isEditingPlan) {
        return;
      }

      const char = input.toLowerCase();

      // Help overlay toggle
      if (char === '?') {
        setIsShowingHelp((prev) => !prev);
        return;
      }

      // Escape closes overlays
      if (key.escape) {
        if (isShowingHelp) {
          setIsShowingHelp(false);
          return;
        }
        if (isViewingDiff) {
          setIsViewingDiff(false);
          return;
        }
        if (isViewingArtifact) {
          setIsViewingArtifact(false);
          return;
        }
      }

      if (isShowingHelp) {
        if (char === 'q') {
          setIsShowingHelp(false);
          return;
        }
      }

      // Quit safely
      if (char === 'q' || (key.ctrl && char === 'c')) {
        runner.stop();
        if (onExit) onExit();
        exit();
        return;
      }

      // Mention agent prompt
      if (char === 'm') {
        setIsMentioning(true);
        return;
      }

      // Toggle diff or artifact viewer
      if (char === 'v') {
        const hasDiff = Boolean(
          state.activeChangeset || state.pendingApproval?.diffSnippet || state.latestDiff
        );
        if (hasDiff) {
          setIsViewingDiff((prev) => !prev);
        } else {
          setIsViewingArtifact((prev) => !prev);
        }
        return;
      }


      // Pause / Resume
      if (char === 'p' && runner.pause) {
        runner.pause();
        return;
      }
      if (char === 's' && runner.resume) {
        runner.resume();
        return;
      }

      // Plan Review actions
      if (isAwaitingPlanDecision) {
        if (char === 'a') {
          if (runner.approvePlan) {
            void runner.approvePlan();
          } else if (runner.approve) {
            void runner.approve();
          }
          return;
        }
        if (char === 'r') {
          if (runner.rejectPlan) {
            void runner.rejectPlan();
          } else if (runner.reject) {
            void runner.reject();
          }
          return;
        }
        if (char === 'e') {
          setIsEditingPlan(true);
          return;
        }
      }

      // Action approval (e.g. create_artifact outside dir, or risky action)
      if (state.pendingApproval) {
        if (char === 'a' && runner.approve) {
          void runner.approve(state.pendingApproval.approvalId);
          return;
        }
        if (char === 'r' && runner.reject) {
          void runner.reject(state.pendingApproval.approvalId, 'Rejected by operator in TUI');
          return;
        }
      }
    },
    { isActive: Boolean(isRawModeSupported && process.stdin.isTTY) }
  );

  const completedNodes = state.nodes.filter((n) => n.status === 'done' || n.status === 'completed').length;
  const totalNodes = state.nodes.length || 7;
  const activeNode = state.nodes.find((n) => n.status === 'running' || n.status === 'in_progress');

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      <TaskHeader
        title={state.taskTitle}
        status={state.taskStatus}
        elapsedTime={elapsedTime}
        estimatedCost={state.estimatedCost}
        eventCount={state.eventCount}
        workspaceRoot={state.workspaceRoot}
        mode={state.mode}
        gitInfo={state.gitInfo}
        completedNodes={completedNodes}
        totalNodes={totalNodes}
      />

      {isShowingHelp ? (
        <HelpOverlay onClose={() => setIsShowingHelp(false)} />
      ) : isMentioning ? (
        <MentionPrompt
          onSubmit={async (role, instruction) => {
            setIsMentioning(false);
            if (role === 'planner') {
              if (runner.requestRevision) {
                await runner.requestRevision(instruction);
              }
            } else if (runner.mentionAgent) {
              await runner.mentionAgent(role, instruction);
            }
          }}
          onCancel={() => setIsMentioning(false)}
        />
      ) : isEditingPlan && state.proposedPlan ? (
        <PlanEditPrompt
          plan={state.proposedPlan}
          onApproveEditedPlan={(editedTasks) => {
            setIsEditingPlan(false);
            if (runner.approvePlan) {
              void runner.approvePlan(editedTasks);
            }
          }}
          onCancel={() => setIsEditingPlan(false)}
        />
      ) : isAwaitingPlanDecision && state.proposedPlan ? (
        <PlanProposedView plan={state.proposedPlan} />
      ) : isViewingDiff ? (
        <DiffViewer
          diff={state.pendingApproval?.diffSnippet || state.latestDiff}
          filePath={state.pendingApproval?.targetPath || state.pendingApproval?.target}
          changeset={state.activeChangeset}
          mode={state.mode}
          onApprove={async () => {
            if (state.pendingApproval && runner.approve) {
              await runner.approve(state.pendingApproval.approvalId);
            }
            setIsViewingDiff(false);
          }}
          onReject={async (_id, reason) => {
            if (state.pendingApproval && runner.reject) {
              await runner.reject(state.pendingApproval.approvalId, reason);
            }
            setIsViewingDiff(false);
          }}
          onClose={() => setIsViewingDiff(false)}
        />

      ) : isViewingArtifact ? (
        <ArtifactViewer
          artifact={state.latestArtifact}
          onClose={() => setIsViewingArtifact(false)}
        />
      ) : state.isCompleted ? (
        <TaskCompletedView
          taskId={state.taskId}
          title={state.taskTitle}
          elapsedTime={elapsedTime}
          estimatedCost={state.estimatedCost}
          artifacts={state.artifacts}
          latestDiff={state.latestDiff}
        />
      ) : (
        <>
          <AgentFeed
            items={state.feedItems}
            maxVisible={8}
            activeRole={activeNode?.assignedAgentRole}
            activeDescription={activeNode?.title}
          />
          <TaskGraph nodes={state.nodes} />
        </>
      )}

      {state.pendingApproval && !isMentioning && !isEditingPlan && !isShowingHelp && (
        <ApprovalPrompt approval={state.pendingApproval} />
      )}

      <StatusBar
        isPaused={state.isPaused}
        isCompleted={state.isCompleted}
        hasArtifact={Boolean(state.latestArtifact)}
        isViewingArtifact={isViewingArtifact}
        hasDiff={Boolean(state.activeChangeset || state.pendingApproval?.diffSnippet || state.latestDiff)}
        isViewingDiff={isViewingDiff}
        awaitingApproval={Boolean(state.pendingApproval)}
        awaitingPlanDecision={isAwaitingPlanDecision}
        isShowingHelp={isShowingHelp}
        failed={state.taskStatus === 'failed'}
      />
    </Box>
  );
};
