import React from 'react';
import { Box, Text } from 'ink';
import { Divider } from './Divider.js';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';

export interface SectionProps {
  title?: string;
  dividerAbove?: boolean;
  dividerBelow?: boolean;
  dividerLength?: number;
  indent?: number;
  children: React.ReactNode;
}

export const Section: React.FC<SectionProps> = ({
  title,
  dividerAbove = false,
  dividerBelow = false,
  dividerLength = 62,
  indent = 0,
  children,
}) => {
  const noColor = isNoColor();

  return (
    <Box flexDirection="column" marginY={0}>
      {dividerAbove && <Divider length={dividerLength} />}
      {title && (
        <Box flexDirection="row" marginBottom={0}>
          <Text color={noColor ? undefined : chatterboxAnsi.brand} bold>
            {title}
          </Text>
        </Box>
      )}
      <Box flexDirection="column" paddingLeft={indent}>
        {children}
      </Box>
      {dividerBelow && <Divider length={dividerLength} />}
    </Box>
  );
};
