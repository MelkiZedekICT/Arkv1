import React from 'react';
import { Box, Text, useInput, useStdin } from 'ink';
import { ChatterboxLogo } from './ChatterboxLogo.js';
import { Divider } from './Divider.js';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';
import { symbols } from '../design/symbols.js';

export interface DemoGuideProps {
  phase: 'intro' | 'complete';
  onBegin?: () => void;
  onReturn?: () => void;
  onExit?: () => void;
}

export const DemoGuide: React.FC<DemoGuideProps> = ({
  phase,
  onBegin,
  onReturn,
  onExit,
}) => {
  const noColor = isNoColor();
  const { isRawModeSupported } = useStdin();

  useInput(
    (input, key) => {
      if (phase === 'intro') {
        if (key.return && onBegin) {
          onBegin();
          return;
        }
        if (input.toLowerCase() === 'q' && onExit) {
          onExit();
          return;
        }
      }
      if (phase === 'complete') {
        if (key.return && onReturn) {
          onReturn();
          return;
        }
        if (input.toLowerCase() === 'q' && onExit) {
          onExit();
          return;
        }
      }
    },
    { isActive: Boolean(isRawModeSupported && process.stdin.isTTY) }
  );

  if (phase === 'intro') {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <ChatterboxLogo variant="compact" version="Guided Demo" />

        <Box marginTop={1}>
          <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>
            Watch a team of AI agents complete a research task together.
          </Text>
        </Box>
        <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
          This runs offline — no API key needed.
        </Text>

        <Box flexDirection="column" marginTop={1}>
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>  Steps:</Text>
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>    1. Explorer gathers information</Text>
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>    2. Planner divides the work</Text>
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>    3. Analyst compares findings</Text>
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>    4. Writer creates a brief</Text>
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>    5. Reviewer checks the result</Text>
        </Box>

        <Box marginTop={1}>
          <Text color={noColor ? undefined : chatterboxAnsi.brand}>
            Press Enter to begin…
          </Text>
        </Box>
      </Box>
    );
  }

  // Complete phase
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <ChatterboxLogo variant="compact" version="Guided Demo" />
      <Divider length={62} marginY={0} />

      <Box marginTop={1} flexDirection="row">
        <Text color={noColor ? undefined : chatterboxAnsi.success}>{symbols.status.done} </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textPrimary} bold>Demo complete.</Text>
      </Box>

      <Box marginTop={1}>
        <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
          This was a simulated run. No API calls were made.
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>
          To use Chatterbox with your own repository:
        </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}> </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>
          {'  '}1. Run:  agentfeed setup
        </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>
          {'  '}2. Add your provider API key.
        </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>
          {'  '}3. Run:  agentfeed run {'<'}your goal{'>'} --workspace ./your-project
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
          Press Enter to return · Q to exit
        </Text>
      </Box>
    </Box>
  );
};
