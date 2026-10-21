import React from 'react';
import { Box, Text } from 'ink';
import { StatusDot } from './StatusDot.js';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';

export interface AgentRosterEntry {
  role: string;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'pending' | 'done' | 'busy' | 'paused';
  taskTitle?: string;
  currentAction?: string;
}

export interface AgentRosterProps {
  agents: AgentRosterEntry[];
  title?: string;
}

export const AgentRoster: React.FC<AgentRosterProps> = ({ agents, title }) => {
  const noColor = isNoColor();

  return (
    <Box flexDirection="column" marginY={0}>
      {title && (
        <Text color={noColor ? undefined : chatterboxAnsi.textMuted} bold>
          {title}
        </Text>
      )}
      {agents.map((agent) => {
        const isRunning = agent.status === 'running' || agent.status === 'busy';
        let dotStatus: 'done' | 'active' | 'pending' | 'failed' | 'paused' = 'pending';
        if (agent.status === 'completed' || agent.status === 'done') {
          dotStatus = 'done';
        } else if (isRunning) {
          dotStatus = 'active';
        } else if (agent.status === 'failed') {
          dotStatus = 'failed';
        } else if (agent.status === 'paused') {
          dotStatus = 'paused';
        }

        const roleText = `[${agent.role.toUpperCase()}]`;
        const actionText = agent.currentAction || agent.taskTitle;

        return (
          <Box key={agent.role} flexDirection="row">
            <StatusDot status={dotStatus} />
            <Text> </Text>
            <Text
              color={noColor ? undefined : isRunning ? chatterboxAnsi.brand : chatterboxAnsi.textPrimary}
              bold={isRunning}
            >
              {roleText.padEnd(14)}
            </Text>
            {actionText && (
              <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
                {actionText}
              </Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
};
