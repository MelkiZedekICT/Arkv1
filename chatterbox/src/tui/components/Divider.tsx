import React from 'react';
import { Box, Text } from 'ink';
import { symbols } from '../design/symbols.js';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';

export interface DividerProps {
  length?: number;
  marginY?: number;
}

export const Divider: React.FC<DividerProps> = ({ length = 62, marginY = 0 }) => {
  const noColor = isNoColor();
  const rule = symbols.makeDivider(length);

  return (
    <Box marginY={marginY}>
      <Text color={noColor ? undefined : chatterboxAnsi.surfaceBorder}>{rule}</Text>
    </Box>
  );
};
