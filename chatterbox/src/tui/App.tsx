import React, { useState } from 'react';
import { Box, useInput, useApp, useStdin } from 'ink';
import { EventBus } from '../core/events/event-bus.js';
import { DemoRunner } from '../core/simulation/demo-runner.js';
import { useAgentFeedEvents } from './hooks/useAgentFeedEvents.js';
import { useElapsedTimer } from './hooks/useElapsedTimer.js';
import { TaskHeader } from './components/TaskHeader.js';
import { AgentFeed } from './components/AgentFeed.js';
import { TaskGraph } from './components/TaskGraph.js';
import { ApprovalPrompt } from './components/ApprovalPrompt.js';
import { ArtifactViewer } from './components/ArtifactViewer.js';
import { StatusBar } from './components/StatusBar.js';

export interface AppProps {
  eventBus: EventBus;
  runner: DemoRunner;
  onExit?: () => void;
}

export const App: React.FC<AppProps> = ({ eventBus, runner, onExit }) => {
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();
  const state = useAgentFeedEvents(eventBus);
  const [isViewingArtifact, setIsViewingArtifact] = useState(false);

  const isRunning = state.taskStatus === 'running' || state.taskStatus === 'planning';
  const elapsedTime = useElapsedTimer(isRunning, state.isPaused || state.isCompleted);

  useInput(
    (input, key) => {
    const char = input.toLowerCase();

    // Quit safely
    if (char === 'q' || (key.ctrl && char === 'c')) {
      runner.stop();
      if (onExit) onExit();
      exit();
      return;
    }

    // Toggle artifact viewer
    if (char === 'v') {
      setIsViewingArtifact((prev) => !prev);
      return;
    }

    // Pause / Resume
    if (char === 'p') {
      runner.pause();
      return;
    }
    if (char === 's') {
      runner.resume();
      return;
    }

    // Approval actions
    if (state.pendingApproval) {
      if (char === 'a') {
        runner.approve();
        return;
      }
      if (char === 'r') {
        runner.reject();
        return;
      }
    }
  }, { isActive: Boolean(isRawModeSupported && process.stdin.isTTY) });

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      <TaskHeader
        title={state.taskTitle}
        status={state.taskStatus}
        elapsedTime={elapsedTime}
        estimatedCost={state.estimatedCost}
        eventCount={state.eventCount}
      />

      {isViewingArtifact ? (
        <ArtifactViewer
          artifact={state.latestArtifact}
          onClose={() => setIsViewingArtifact(false)}
        />
      ) : (
        <>
          <AgentFeed items={state.feedItems} maxVisible={8} />
          <TaskGraph nodes={state.nodes} />
        </>
      )}

      {state.pendingApproval && (
        <ApprovalPrompt approval={state.pendingApproval} />
      )}

      <StatusBar
        isPaused={state.isPaused}
        isCompleted={state.isCompleted}
        hasArtifact={Boolean(state.latestArtifact)}
        isViewingArtifact={isViewingArtifact}
        awaitingApproval={Boolean(state.pendingApproval)}
      />
    </Box>
  );
};
