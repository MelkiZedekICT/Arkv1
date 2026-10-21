import React from 'react';
import { Text } from 'ink';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';

export function getRoleColor(role: string): string {
  switch (role.toLowerCase()) {
    case 'planner':
      return 'cyan';
    case 'researcher':
      return 'green';
    case 'analyst':
      return 'yellow';
    case 'writer':
      return 'magenta';
    case 'reviewer':
      return 'blue';
    case 'user':
      return 'greenBright';
    case 'system':
    default:
      return 'gray';
  }
}

export interface AgentAvatarProps {
  role: string;
}

export const AgentAvatar: React.FC<AgentAvatarProps> = ({ role }) => {
  const noColor = isNoColor();
  return (
    <Text color={noColor ? undefined : chatterboxAnsi.textPrimary} bold>
      {`[${role.toUpperCase()}]`}
    </Text>
  );
};
