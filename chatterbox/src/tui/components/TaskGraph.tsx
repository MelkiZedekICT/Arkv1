import React from 'react';
import { Box, Text } from 'ink';
import { TaskNodeState } from '../hooks/useAgentFeedEvents.js';
import { AgentAvatar } from './AgentAvatar.js';
import { Spinner } from './Spinner.js';

export interface TaskGraphProps {
  nodes: TaskNodeState[];
}

function getNodeStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'done':
      return 'green';
    case 'running':
      return 'cyan';
    case 'awaiting_approval':
      return 'yellow';
    case 'blocked':
    case 'failed':
      return 'red';
    case 'pending':
    default:
      return 'gray';
  }
}

export const TaskGraph: React.FC<TaskGraphProps> = ({ nodes }) => {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
    >
      <Box marginBottom={0}>
        <Text bold color="yellow">
          TASK GRAPH
        </Text>
      </Box>
      {nodes.length === 0 ? (
        <Text dimColor>No task nodes created yet...</Text>
      ) : (
        nodes.map((node, index) => {
          const statusColor = getNodeStatusColor(node.status);
          const isRunning = node.status === 'running';

          return (
            <Box key={node.id} flexDirection="row" justifyContent="space-between">
              <Box flexDirection="row">
                <Text color="white">
                  {index + 1}. {node.title.padEnd(32)}
                </Text>
                <AgentAvatar role={node.assignedAgentRole} />
              </Box>
              <Box flexDirection="row">
                {isRunning && <Spinner color="cyan" />}
                <Text color={statusColor} bold>
                  {node.status}
                </Text>
              </Box>
            </Box>
          );
        })
      )}
    </Box>
  );
};
