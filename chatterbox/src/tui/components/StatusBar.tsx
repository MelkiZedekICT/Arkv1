import React from 'react';
import { ShortcutBar, ShortcutItem } from './ShortcutBar.js';

export interface StatusBarProps {
  isPaused: boolean;
  isCompleted: boolean;
  hasArtifact: boolean;
  isViewingArtifact: boolean;
  hasDiff?: boolean;
  isViewingDiff?: boolean;
  awaitingApproval: boolean;
  awaitingPlanDecision?: boolean;
  isShowingHelp?: boolean;
  isSelectingMessage?: boolean;
  failed?: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  isPaused,
  isCompleted,
  hasArtifact,
  isViewingArtifact,
  hasDiff,
  isViewingDiff,
  awaitingApproval,
  awaitingPlanDecision,
  isShowingHelp,
  isSelectingMessage,
  failed,
}) => {
  const shortcuts: ShortcutItem[] = [];

  if (isShowingHelp) {
    shortcuts.push({ keyLabel: '?', action: 'close help' });
    shortcuts.push({ keyLabel: 'Esc', action: 'close' });
  } else if (isSelectingMessage) {
    shortcuts.push({ keyLabel: '↑/↓', action: 'navigate', color: 'white' });
    shortcuts.push({ keyLabel: 'Enter', action: 'actions', color: 'green' });
    shortcuts.push({ keyLabel: 'Esc', action: 'cancel', color: 'gray' });
  } else if (awaitingPlanDecision) {
    shortcuts.push({ keyLabel: 'A', action: 'approve plan', color: 'green' });
    shortcuts.push({ keyLabel: 'R', action: 'reject plan', color: 'red' });
    shortcuts.push({ keyLabel: 'E', action: 'edit plan', color: 'yellow' });
    shortcuts.push({ keyLabel: 'M', action: 'revise', color: 'white' });
    shortcuts.push({ keyLabel: '?', action: 'help' });
    shortcuts.push({ keyLabel: 'Q', action: 'quit', color: 'gray' });
  } else if (awaitingApproval) {
    shortcuts.push({ keyLabel: 'A', action: 'approve', color: 'green' });
    shortcuts.push({ keyLabel: 'R', action: 'reject', color: 'red' });
    if (hasDiff) {
      shortcuts.push({
        keyLabel: 'V',
        action: isViewingDiff ? 'close diff' : 'view diff',
        color: 'yellow',
      });
    }
    shortcuts.push({ keyLabel: '?', action: 'help' });
    shortcuts.push({ keyLabel: 'Q', action: 'quit', color: 'gray' });
  } else if (isPaused) {
    shortcuts.push({ keyLabel: 'S', action: 'resume', color: 'green' });
    shortcuts.push({ keyLabel: 'M', action: 'mention', color: 'white' });
    if (hasDiff) {
      shortcuts.push({
        keyLabel: 'V',
        action: isViewingDiff ? 'close diff' : 'view diff',
        color: 'yellow',
      });
    }
    shortcuts.push({ keyLabel: '?', action: 'help' });
    shortcuts.push({ keyLabel: 'Q', action: 'quit', color: 'gray' });
  } else if (isCompleted) {
    if (hasArtifact) {
      shortcuts.push({
        keyLabel: 'V',
        action: isViewingArtifact ? 'close summary' : 'view summary',
        color: 'white',
      });
    }
    shortcuts.push({ keyLabel: 'Q', action: 'exit', color: 'gray' });
  } else {
    // Normal running state
    shortcuts.push({ keyLabel: '↑/↓', action: 'select message', color: 'white' });
    shortcuts.push({ keyLabel: 'Enter', action: 'actions', color: 'white' });
    shortcuts.push({ keyLabel: 'P', action: 'pause', color: 'yellow' });
    shortcuts.push({ keyLabel: '/model', action: 'switch', color: 'white' });
    if (hasDiff) {
      shortcuts.push({
        keyLabel: 'V',
        action: isViewingDiff ? 'close diff' : 'view diff',
        color: 'yellow',
      });
    } else if (hasArtifact) {
      shortcuts.push({
        keyLabel: 'V',
        action: isViewingArtifact ? 'close artifact' : 'view artifact',
        color: 'white',
      });
    }
    shortcuts.push({ keyLabel: '?', action: 'help' });
    shortcuts.push({ keyLabel: 'Q', action: 'quit', color: 'gray' });
  }

  let rightStatus: { text: string; color: 'yellow' | 'green' | 'red' | 'gray' } | undefined;
  if (failed) {
    rightStatus = { text: 'FAILED', color: 'red' };
  } else if (isPaused) {
    rightStatus = { text: 'PAUSED', color: 'yellow' };
  } else if (isCompleted) {
    rightStatus = { text: 'DONE', color: 'green' };
  }

  return <ShortcutBar shortcuts={shortcuts} rightStatus={rightStatus} />;
};
