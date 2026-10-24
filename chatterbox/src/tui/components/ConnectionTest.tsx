import React from 'react';
import { Box, Text } from 'ink';
import { Spinner } from './Spinner.js';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';
import { symbols } from '../design/symbols.js';

export interface ConnectionTestProps {
  status: 'testing' | 'success' | 'error';
  providerName: string;
  model: string;
  errorMessage?: string;
  onRetry?: () => void;
  onBack?: () => void;
}

export const ConnectionTest: React.FC<ConnectionTestProps> = ({
  status,
  providerName,
  model,
  errorMessage,
}) => {
  const noColor = isNoColor();

  if (status === 'testing') {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box flexDirection="row">
          <Spinner />
          <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>
            Testing connection to {providerName}…
          </Text>
        </Box>
      </Box>
    );
  }

  if (status === 'success') {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Box flexDirection="row">
          <Text color={noColor ? undefined : chatterboxAnsi.success}>{symbols.status.done} </Text>
          <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>
            Connected to {providerName} · {model}
          </Text>
        </Box>
        <Box flexDirection="row" marginTop={0}>
          <Text color={noColor ? undefined : chatterboxAnsi.success}>{symbols.status.done} </Text>
          <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>
            Provider and model saved.
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
            Press Enter to continue.
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row">
        <Text color={noColor ? undefined : chatterboxAnsi.error}>{symbols.status.failed} </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>
          Connection failed: {errorMessage || 'Unknown error'}
        </Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>Possible causes:</Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
          {'  '}• The API key may be expired or incorrect.
        </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
          {'  '}• Verify endpoint URL or model availability.
        </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
          {'  '}• Check your internet connection or proxy settings.
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
          R retry · B go back · Esc cancel
        </Text>
      </Box>
    </Box>
  );
};
