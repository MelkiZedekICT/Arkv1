import React from 'react';
import { Box, Text } from 'ink';

export interface TaskHeaderProps {
  title: string;
  status: string;
  elapsedTime: string;
  estimatedCost: number;
  eventCount: number;
}

function getStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'ready':
      return 'greenBright';
    case 'awaiting_approval':
      return 'yellowBright';
    case 'running':
      return 'cyan';
    case 'paused':
      return 'yellow';
    case 'done':
      return 'green';
    case 'failed':
      return 'red';
    case 'planning':
      return 'blue';
    default:
      return 'gray';
  }
}

export const TaskHeader: React.FC<TaskHeaderProps> = ({
  title,
  status,
  elapsedTime,
  estimatedCost,
  eventCount,
}) => {
  const statusColor = getStatusColor(status);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="blue"
      paddingX={1}
    >
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold color="white">
          {title || 'Loading goal...'}
        </Text>
      </Box>
      <Box flexDirection="row">
        <Text dimColor>Status: </Text>
        <Text color={statusColor} bold>
          {status.toUpperCase()}
        </Text>
        <Text dimColor>  ·  Elapsed: </Text>
        <Text color="white">{elapsedTime}</Text>
        <Text dimColor>  ·  Est. cost: </Text>
        <Text color="green">${estimatedCost.toFixed(3)}</Text>
        <Text dimColor>  ·  Events: </Text>
        <Text color="cyan">{eventCount}</Text>
      </Box>
    </Box>
  );
};
