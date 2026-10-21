import React from 'react';
import { Box, Text } from 'ink';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';

export interface KeyValueProps {
  label: string;
  value: string | number;
  valueColor?: 'white' | 'gray' | 'yellow' | 'green' | 'red' | 'blue';
  boldValue?: boolean;
}

export const KeyValue: React.FC<KeyValueProps> = ({
  label,
  value,
  valueColor = 'white',
  boldValue = false,
}) => {
  const noColor = isNoColor();

  return (
    <Box flexDirection="row">
      <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>{label}: </Text>
      <Text color={noColor ? undefined : valueColor} bold={boldValue}>
        {value}
      </Text>
    </Box>
  );
};
