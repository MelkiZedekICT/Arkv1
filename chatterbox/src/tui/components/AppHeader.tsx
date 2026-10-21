import React from 'react';
import { Box, Text } from 'ink';
import { ChatterboxLogo } from './ChatterboxLogo.js';
import { Divider } from './Divider.js';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';

export interface AppHeaderProps {
  title: string;
  status: string;
  elapsedTime: string;
  estimatedCost: number;
  workspaceRoot?: string;
  mode?: string;
  gitInfo?: {
    isGitRepo?: boolean;
    branch?: string;
    headCommit?: string;
  };
  completedNodes?: number;
  totalNodes?: number;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  title,
  status,
  elapsedTime,
  estimatedCost,
  workspaceRoot,
  mode = 'supervised',
  gitInfo,
  completedNodes = 0,
  totalNodes = 7,
}) => {
  const noColor = isNoColor();

  let gitDisplay = '';
  if (gitInfo) {
    if (gitInfo.isGitRepo) {
      gitDisplay = `git:${gitInfo.branch || 'main'}@${gitInfo.headCommit ? gitInfo.headCommit.slice(0, 7) : 'head'}`;
    } else {
      gitDisplay = 'git:(none)';
    }
  }

  const isPaused = status.toLowerCase() === 'paused';

  return (
    <Box flexDirection="column" marginY={0}>
      {/* Brand Header */}
      <ChatterboxLogo variant="compact" version="v0.1.0" />

      {/* Task & Workspace Metadata */}
      <Box flexDirection="column" marginY={0}>
        <Box flexDirection="row">
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>Task: </Text>
          <Text color={noColor ? undefined : chatterboxAnsi.textPrimary} bold>
            {title || 'Initializing task...'}
          </Text>
        </Box>

        <Box flexDirection="row">
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>Workspace: </Text>
          <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>{workspaceRoot || './'}</Text>
          {gitDisplay && (
            <>
              <Text color={noColor ? undefined : chatterboxAnsi.textMuted}> · </Text>
              <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>{gitDisplay}</Text>
            </>
          )}
          <Text color={noColor ? undefined : chatterboxAnsi.textMuted}> · </Text>
          <Text color={noColor ? undefined : (mode === 'read-only' ? 'magenta' : mode === 'supervised' ? chatterboxAnsi.warning : chatterboxAnsi.success)}>
            {mode}
          </Text>
        </Box>

        <Box flexDirection="row">
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>Progress: </Text>
          <Text color={noColor ? undefined : chatterboxAnsi.textPrimary} bold>
            {completedNodes}/{totalNodes} nodes
          </Text>
          <Text color={noColor ? undefined : chatterboxAnsi.textMuted}> · </Text>
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>{elapsedTime}</Text>
          <Text color={noColor ? undefined : chatterboxAnsi.textMuted}> · </Text>
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>
            ${typeof estimatedCost === 'number' ? estimatedCost.toFixed(2) : '0.00'}
          </Text>
          {isPaused && (
            <>
              <Text color={noColor ? undefined : chatterboxAnsi.textMuted}> · </Text>
              <Text color={noColor ? undefined : chatterboxAnsi.warning} bold>
                [PAUSED]
              </Text>
            </>
          )}
        </Box>
      </Box>

      {/* Horizontal Divider */}
      <Divider length={62} marginY={0} />
    </Box>
  );
};
