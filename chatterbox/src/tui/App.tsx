import React, { useState, useMemo } from 'react';
import { Box, useInput, useApp, useStdin } from 'ink';
import { EventBus } from '../core/events/event-bus.js';
import { useAgentFeedEvents, ProposedPlanTaskState, FeedItem } from './hooks/useAgentFeedEvents.js';
import { useElapsedTimer } from './hooks/useElapsedTimer.js';
import { useMessageSelection } from './hooks/useMessageSelection.js';
import { TaskHeader } from './components/TaskHeader.js';
import { AgentFeed } from './components/AgentFeed.js';
import { TaskGraph } from './components/TaskGraph.js';
import { ApprovalPrompt } from './components/ApprovalPrompt.js';
import { ArtifactViewer } from './components/ArtifactViewer.js';
import { DiffViewer } from './components/DiffViewer.js';
import { PlanProposedView } from './components/PlanProposedView.js';
import { PlanEditPrompt } from './components/PlanEditPrompt.js';
import { TaskCompletedView } from './components/TaskCompletedView.js';
import { StatusBar } from './components/StatusBar.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { ChatInput } from './components/ChatInput.js';
import { AgentSelector } from './components/AgentSelector.js';
import { MessageActions } from './components/MessageActions.js';
import { ModelSwitcher } from './components/ModelSwitcher.js';
import { Divider } from './components/Divider.js';
import {
  PROVIDER_DEFINITIONS,
  PROVIDER_DISPLAY_ORDER,
} from '../core/config/provider-registry.js';
import { checkApiKeyStatus } from '../core/config/credential-store.js';

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
  provider?: string;
  model?: string;
  onExit?: () => void;
}

export const App: React.FC<AppProps> = ({
  eventBus,
  runner,
  provider = 'OpenAI',
  model = 'gpt-4.1-mini',
  onExit,
}) => {
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();
  const state = useAgentFeedEvents(eventBus);
  const selection = useMessageSelection();

  const [activeProvider, setActiveProvider] = useState(provider);
  const [activeModel, setActiveModel] = useState(model);
  const [isViewingArtifact, setIsViewingArtifact] = useState(false);
  const [isViewingDiff, setIsViewingDiff] = useState(false);
  const [isMentioning, setIsMentioning] = useState(false);
  const [mentionTargetAgent, setMentionTargetAgent] = useState<string | null>(null);
  const [isEditingPlan, setIsEditingPlan] = useState(false);
  const [isShowingHelp, setIsShowingHelp] = useState(false);
  const [isSwitchingModel, setIsSwitchingModel] = useState(false);
  const [activeActionItem, setActiveActionItem] = useState<FeedItem | null>(null);

  const isRunning =
    state.taskStatus === 'running' ||
    state.taskStatus === 'planning' ||
    state.taskStatus === 'awaiting_approval';
  const elapsedTime = useElapsedTimer(isRunning, state.isPaused || state.isCompleted);

  const isAwaitingPlanDecision = Boolean(
    state.proposedPlan && state.planDecision === 'awaiting_decision'
  );

  // Build model switcher options
  const modelOptions = useMemo(() => {
    const opts: Array<{ provider: string; model: string; isCurrent: boolean }> = [];
    for (const pName of PROVIDER_DISPLAY_ORDER) {
      if (pName === 'custom') continue;
      const def = PROVIDER_DEFINITIONS[pName];
      const keyStatus = checkApiKeyStatus(pName, def.apiKeyEnvVar);
      if (!def.requiresApiKey || keyStatus.isSet) {
        for (const m of def.popularModels) {
          opts.push({
            provider: def.displayName,
            model: m,
            isCurrent: activeProvider === def.displayName && activeModel === m,
          });
        }
      }
    }
    if (opts.length === 0) {
      opts.push({
        provider: activeProvider,
        model: activeModel,
        isCurrent: true,
      });
    }
    return opts;
  }, [activeProvider, activeModel]);

  useInput(
    (input, key) => {
      // Don't intercept single keys if user is in an active overlay or prompt
      if (
        isMentioning ||
        isEditingPlan ||
        isSwitchingModel ||
        activeActionItem ||
        isShowingHelp
      ) {
        if (key.escape) {
          setIsMentioning(false);
          setIsEditingPlan(false);
          setIsSwitchingModel(false);
          setActiveActionItem(null);
          setIsShowingHelp(false);
        }
        return;
      }

      // Escape closes viewers or message selection
      if (key.escape) {
        if (isViewingDiff) {
          setIsViewingDiff(false);
          return;
        }
        if (isViewingArtifact) {
          setIsViewingArtifact(false);
          return;
        }
        if (selection.isSelecting) {
          selection.exitSelectionMode();
          return;
        }
        if (mentionTargetAgent) {
          setMentionTargetAgent(null);
          return;
        }
      }

      // Message selection navigation
      if (key.upArrow) {
        if (!selection.isSelecting) {
          selection.enterSelectionMode();
        }
        selection.moveUp(state.feedItems);
        return;
      }

      if (key.downArrow) {
        if (!selection.isSelecting) {
          selection.enterSelectionMode();
        }
        selection.moveDown(state.feedItems);
        return;
      }

      if (key.return && selection.isSelecting && selection.selectedItem) {
        setActiveActionItem(selection.selectedItem);
        return;
      }

      const char = input.toLowerCase();

      // Help overlay toggle
      if (char === '?') {
        setIsShowingHelp((prev) => !prev);
        return;
      }

      // Quit safely
      if (char === 'q' || (key.ctrl && char === 'c')) {
        runner.stop();
        if (onExit) onExit();
        exit();
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

      // Action approval
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

  const completedNodes = state.nodes.filter(
    (n) => n.status === 'done' || n.status === 'completed'
  ).length;
  const totalNodes = state.nodes.length || 7;
  const activeNode = state.nodes.find(
    (n) => n.status === 'running' || n.status === 'in_progress'
  );

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
        provider={activeProvider}
        model={activeModel}
      />

      {isShowingHelp ? (
        <HelpOverlay onClose={() => setIsShowingHelp(false)} />
      ) : activeActionItem ? (
        <MessageActions
          item={activeActionItem}
          onAction={(action, item) => {
            setActiveActionItem(null);
            selection.exitSelectionMode();
            if (action === 'approve') {
              if (runner.approve && state.pendingApproval) {
                void runner.approve(state.pendingApproval.approvalId);
              }
            } else if (action === 'reject') {
              if (runner.reject && state.pendingApproval) {
                void runner.reject(state.pendingApproval.approvalId, 'Rejected by operator');
              }
            } else if (action === 'ask') {
              setMentionTargetAgent(item.role || 'planner');
            } else if (action === 'revise') {
              if (runner.requestRevision) {
                void runner.requestRevision(`Revision requested for: ${item.content}`);
              }
            } else if (action === 'redirect') {
              setIsMentioning(true);
            } else if (action === 'viewdiff') {
              setIsViewingDiff(true);
            }
          }}
          onClose={() => setActiveActionItem(null)}
        />
      ) : isSwitchingModel ? (
        <ModelSwitcher
          currentProvider={activeProvider}
          currentModel={activeModel}
          options={modelOptions}
          onSelect={(prov, mdl) => {
            setActiveProvider(prov);
            setActiveModel(mdl);
            setIsSwitchingModel(false);
          }}
          onCancel={() => setIsSwitchingModel(false)}
        />
      ) : isMentioning ? (
        <AgentSelector
          onSelect={(role) => {
            setMentionTargetAgent(role);
            setIsMentioning(false);
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
            selectedIndex={selection.selectedIndex}
            isSelecting={selection.isSelecting}
          />
          <TaskGraph nodes={state.nodes} />
        </>
      )}

      {state.pendingApproval &&
        !isMentioning &&
        !isEditingPlan &&
        !isShowingHelp &&
        !activeActionItem &&
        !isSwitchingModel && (
          <ApprovalPrompt approval={state.pendingApproval} />
        )}

      {/* Always-visible Chat Input */}
      {!state.isCompleted && (
        <Box flexDirection="column" marginTop={0}>
          <Divider length={62} marginY={0} />
          <ChatInput
            targetAgent={mentionTargetAgent || undefined}
            disabled={
              isShowingHelp ||
              isViewingDiff ||
              isViewingArtifact ||
              isSwitchingModel ||
              Boolean(activeActionItem) ||
              isMentioning ||
              isEditingPlan
            }
            onSubmit={(message) => {
              const target = mentionTargetAgent || 'planner';
              if (runner.mentionAgent) {
                void runner.mentionAgent(target, message);
              }
              setMentionTargetAgent(null);
            }}
            onMentionRequest={() => {
              setIsMentioning(true);
            }}
            onSlashCommand={(cmd) => {
              if (cmd === '/model') {
                setIsSwitchingModel(true);
              }
            }}
          />
        </Box>
      )}

      <Divider length={62} marginY={0} />

      <StatusBar
        isPaused={state.isPaused}
        isCompleted={state.isCompleted}
        hasArtifact={Boolean(state.latestArtifact)}
        isViewingArtifact={isViewingArtifact}
        hasDiff={Boolean(
          state.activeChangeset || state.pendingApproval?.diffSnippet || state.latestDiff
        )}
        isViewingDiff={isViewingDiff}
        awaitingApproval={Boolean(state.pendingApproval)}
        awaitingPlanDecision={isAwaitingPlanDecision}
        isShowingHelp={isShowingHelp}
        isSelectingMessage={selection.isSelecting}
        failed={state.taskStatus === 'failed'}
      />
    </Box>
  );
};
