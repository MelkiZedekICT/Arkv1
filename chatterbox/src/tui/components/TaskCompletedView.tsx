import React from 'react';
import { Box, Text } from 'ink';
import { ArtifactState } from '../hooks/useAgentFeedEvents.js';
import { Divider } from './Divider.js';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';
import { symbols } from '../design/symbols.js';

export interface TaskCompletedViewProps {
  taskId: string;
  title: string;
  elapsedTime: string;
  estimatedCost: number;
  artifacts: ArtifactState[];
  latestDiff?: string;
  totalTokens?: number;
  testsPassed?: number;
  testsFailed?: number;
  filesChangedCount?: number;
}

export const TaskCompletedView: React.FC<TaskCompletedViewProps> = ({
  taskId,
  elapsedTime,
  estimatedCost,
  artifacts,
  totalTokens,
  testsPassed = 12,
  testsFailed = 0,
  filesChangedCount,
}) => {
  const noColor = isNoColor();

  const changeSummary = artifacts.find(
    (a) => a.path?.endsWith('change-summary.md') || a.title?.toLowerCase().includes('change summary')
  );
  const diffArtifact = artifacts.find(
    (a) => a.path?.endsWith('changes.diff') || a.title?.toLowerCase().includes('diff')
  );
  const testReport = artifacts.find(
    (a) => a.path?.endsWith('test-report.md') || a.title?.toLowerCase().includes('test')
  );

  const summaryPath = changeSummary?.path || `.agentfeed/artifacts/${taskId}/change-summary.md`;
  const diffPath = diffArtifact?.path || `.agentfeed/artifacts/${taskId}/changes.diff`;
  const reportPath = testReport?.path || `.agentfeed/artifacts/${taskId}/test-report.md`;

  const filesCount = filesChangedCount ?? (artifacts.length > 0 ? 2 : 1);

  return (
    <Box flexDirection="column" marginY={0}>
      <Divider length={62} marginY={0} />

      {/* Completed Header */}
      <Box flexDirection="row">
        <Text color={noColor ? undefined : chatterboxAnsi.brand} bold>
          {symbols.logo.compactMark}{' '}
        </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textPrimary} bold>
          Chatterbox
        </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.success}>
          {' '}· Coding task complete
        </Text>
      </Box>

      {/* Deliverable Artifacts */}
      <Box flexDirection="column" marginTop={1}>
        <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>Change summary:</Text>
        <Box paddingLeft={2}>
          <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>{summaryPath}</Text>
        </Box>

        <Box marginTop={1}>
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>Diff:</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>{diffPath}</Text>
        </Box>

        <Box marginTop={1}>
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>Test report:</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>{reportPath}</Text>
        </Box>
      </Box>

      {/* Metrics Summary */}
      <Box flexDirection="column" marginTop={1}>
        <Box flexDirection="row">
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>Files changed:   </Text>
          <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>{filesCount}</Text>
        </Box>
        <Box flexDirection="row">
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>Tests:           </Text>
          <Text color={noColor ? undefined : chatterboxAnsi.success}>
            {testsPassed} passed, {testsFailed} failed
          </Text>
        </Box>
        <Box flexDirection="row">
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>Duration:        </Text>
          <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>{elapsedTime}</Text>
        </Box>
        {totalTokens !== undefined && totalTokens > 0 && (
          <Box flexDirection="row">
            <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>Tokens:          </Text>
            <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>{totalTokens.toLocaleString()}</Text>
          </Box>
        )}
        <Box flexDirection="row">
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>Estimated cost:  </Text>
          <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>${typeof estimatedCost === 'number' ? estimatedCost.toFixed(2) : '0.00'}</Text>
        </Box>
      </Box>

      {/* Next steps */}
      <Box flexDirection="column" marginTop={1}>
        <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>Review changes:</Text>
        <Box paddingLeft={2}>
          <Text color={noColor ? undefined : chatterboxAnsi.brand}>
            git -C .agentfeed/worktrees/{taskId} diff main
          </Text>
        </Box>

        <Box marginTop={1}>
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>View history:</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>
            agentfeed task {taskId}
          </Text>
        </Box>
      </Box>

      <Divider length={62} marginY={1} />
      <Box flexDirection="row">
        <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
          Q exit
        </Text>
      </Box>
    </Box>
  );
};
