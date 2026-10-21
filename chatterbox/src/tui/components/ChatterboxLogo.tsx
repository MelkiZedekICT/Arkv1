import React from 'react';
import { Box, Text } from 'ink';
import { symbols } from '../design/symbols.js';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';

export interface ChatterboxLogoProps {
  variant?: 'full' | 'compact';
  version?: string;
}

export const ChatterboxLogo: React.FC<ChatterboxLogoProps> = ({
  variant = 'compact',
  version = 'v0.1.0',
}) => {
  if (process.env.AGENTFEED_NO_LOGO === '1') {
    return null;
  }

  const noColor = isNoColor();

  if (variant === 'full') {
    const fullLogo = symbols.logo.getFullLogo();
    if (!fullLogo) return null;

    return (
      <Box flexDirection="column" marginY={1}>
        <Text color={noColor ? undefined : chatterboxAnsi.brand} bold>
          {fullLogo}
        </Text>
      </Box>
    );
  }

  // Compact header logo
  return (
    <Box flexDirection="row">
      <Text color={noColor ? undefined : chatterboxAnsi.brand} bold>
        {symbols.logo.compactMark}{' '}
      </Text>
      <Text color={noColor ? undefined : chatterboxAnsi.textPrimary} bold>
        Chatterbox
      </Text>
      <Text color={noColor ? undefined : chatterboxAnsi.textMuted}> · {version}</Text>
    </Box>
  );
};
