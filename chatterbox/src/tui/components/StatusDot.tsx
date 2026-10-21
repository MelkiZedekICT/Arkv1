import React from 'react';
import { Text } from 'ink';
import { symbols } from '../design/symbols.js';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';

export interface StatusDotProps {
  status: 'done' | 'completed' | 'running' | 'in_progress' | 'active' | 'failed' | 'blocked' | 'paused' | 'pending' | string;
}

export const StatusDot: React.FC<StatusDotProps> = ({ status }) => {
  const noColor = isNoColor();
  const normalized = status.toLowerCase();

  let glyph = symbols.status.pending;
  let color: 'green' | 'yellow' | 'red' | 'gray' = 'gray';

  switch (normalized) {
    case 'done':
    case 'completed':
      glyph = symbols.status.done;
      color = chatterboxAnsi.success;
      break;
    case 'running':
    case 'in_progress':
    case 'active':
      glyph = symbols.status.active;
      color = chatterboxAnsi.brand;
      break;
    case 'failed':
    case 'blocked':
      glyph = symbols.status.failed;
      color = chatterboxAnsi.error;
      break;
    case 'paused':
      glyph = symbols.status.paused;
      color = chatterboxAnsi.warning;
      break;
    case 'pending':
    default:
      glyph = symbols.status.pending;
      color = chatterboxAnsi.textMuted;
      break;
  }

  return (
    <Text color={noColor ? undefined : color} bold>
      {glyph}
    </Text>
  );
};
