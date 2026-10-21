import React from 'react';
import { Box, Text, useInput } from 'ink';
import { Divider } from './Divider.js';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';

export interface HelpOverlayProps {
  onClose: () => void;
}

export const HelpOverlay: React.FC<HelpOverlayProps> = ({ onClose }) => {
  const noColor = isNoColor();

  useInput((input, key) => {
    if (key.escape || input === '?' || input.toLowerCase() === 'q') {
      onClose();
    }
  });

  const shortcuts = [
    { key: 'A', desc: 'Approve current plan, changeset, or gated action' },
    { key: 'R', desc: 'Reject current plan, changeset, or gated action' },
    { key: 'E', desc: 'Edit proposed execution plan' },
    { key: 'P', desc: 'Pause task execution (freezes timer, suspends agents)' },
    { key: 'S', desc: 'Resume paused task execution' },
    { key: 'M', desc: 'Mention an agent to steer or provide guidance' },
    { key: 'V', desc: 'Toggle unified diff or latest artifact deliverable' },
    { key: '?', desc: 'Toggle this keyboard shortcut help overlay' },
    { key: 'Q', desc: 'Quit current task execution safely' },
    { key: 'Ctrl+C', desc: 'Safe-exit and restore terminal state' },
    { key: '↑/↓', desc: 'Scroll feed, diff viewer, or artifact viewer' },
    { key: 'N/P', desc: 'Next / previous file in multi-file diff viewer' },
    { key: 'Esc', desc: 'Close open overlay, modal, or viewer' },
  ];

  return (
    <Box flexDirection="column" marginY={1}>
      <Divider length={62} marginY={0} />
      <Box flexDirection="row">
        <Text color={noColor ? undefined : chatterboxAnsi.brand} bold>
          KEYBOARD SHORTCUTS
        </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}> · Chatterbox Control Room</Text>
      </Box>
      <Divider length={62} marginY={0} />

      <Box flexDirection="column" marginY={0}>
        {shortcuts.map((sc, idx) => (
          <Box key={idx} flexDirection="row">
            <Text color={noColor ? undefined : chatterboxAnsi.brand} bold>
              {sc.key.padEnd(8)}
            </Text>
            <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>
              {sc.desc}
            </Text>
          </Box>
        ))}
      </Box>

      <Divider length={62} marginY={0} />
      <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
        Press ? or Esc to close help overlay
      </Text>
    </Box>
  );
};
