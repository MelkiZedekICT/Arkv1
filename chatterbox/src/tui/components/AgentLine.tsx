import React from 'react';
import { Box, Text } from 'ink';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';

export interface AgentLineProps {
  role: string;
  message: string;
  kind?: string;
  timestamp?: string;
  maxWidth?: number;
}

export const AgentLine: React.FC<AgentLineProps> = ({
  role,
  message,
  kind,
  maxWidth = 100,
}) => {
  const noColor = isNoColor();
  const roleTag = `[${role.toUpperCase()}]`;

  // Safe truncation for long single-line outputs
  const singleLine = message.replace(/\r?\n/g, ' ').trim();
  const truncated = singleLine.length > maxWidth ? `${singleLine.slice(0, maxWidth - 3)}...` : singleLine;

  const roleColor = kind === 'error' ? chatterboxAnsi.error : chatterboxAnsi.textSecondary;
  const textColor = kind === 'error' ? chatterboxAnsi.error : chatterboxAnsi.textPrimary;

  return (
    <Box flexDirection="row">
      <Text color={noColor ? undefined : roleColor} bold={kind === 'thought'}>
        {roleTag}
      </Text>
      <Text> </Text>
      <Text color={noColor ? undefined : textColor}>
        {truncated}
      </Text>
    </Box>
  );
};
