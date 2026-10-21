import React from 'react';
import { Box, Text } from 'ink';
import { TaskNodeState } from '../hooks/useAgentFeedEvents.js';
import { Divider } from './Divider.js';
import { StatusDot } from './StatusDot.js';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';

export interface TaskGraphProps {
  nodes: TaskNodeState[];
  dividerLength?: number;
}

export const TaskGraph: React.FC<TaskGraphProps> = ({ nodes, dividerLength = 62 }) => {
  const noColor = isNoColor();

  return (
    <Box flexDirection="column" marginY={0}>
      <Divider length={dividerLength} marginY={0} />

      {nodes.length === 0 ? (
        <Box paddingLeft={1}>
          <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
            Awaiting task decomposition...
          </Text>
        </Box>
      ) : (
        nodes.map((node, index) => {
          const isRunning = node.status === 'running' || node.status === 'in_progress';
          const isDone = node.status === 'done' || node.status === 'completed';

          const paddedTitle =
            node.title.length > 26
              ? `${node.title.slice(0, 23)}...`.padEnd(26)
              : node.title.padEnd(26);

          const roleText = node.assignedAgentRole ? node.assignedAgentRole.toLowerCase() : 'agent';

          const textColor = isRunning
            ? chatterboxAnsi.textPrimary
            : isDone
              ? chatterboxAnsi.textSecondary
              : chatterboxAnsi.textMuted;

          return (
            <Box key={node.id} flexDirection="row">
              <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>{index + 1} </Text>
              <StatusDot status={node.status} />
              <Text> </Text>
              <Text color={noColor ? undefined : textColor} bold={isRunning}>
                {paddedTitle}
              </Text>
              <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>   {roleText}</Text>
            </Box>
          );
        })
      )}

      <Divider length={dividerLength} marginY={0} />
    </Box>
  );
};
