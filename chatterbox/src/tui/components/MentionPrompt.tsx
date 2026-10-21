import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Divider } from './Divider.js';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';

export interface MentionPromptProps {
  onSubmit: (role: string, instruction: string) => void;
  onCancel: () => void;
}

export const MentionPrompt: React.FC<MentionPromptProps> = ({ onSubmit, onCancel }) => {
  const noColor = isNoColor();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  useInput((char, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.return) {
      const trimmed = input.trim();
      if (!trimmed.startsWith('@')) {
        setError('Mention must start with @<role>, e.g. @coder or @planner');
        return;
      }

      const match = trimmed.match(/^@([a-zA-Z_-]+)\s+(.+)$/);
      if (!match) {
        setError('Format: @<agent-role> <instruction>');
        return;
      }

      const role = match[1].toLowerCase();
      const instruction = match[2].trim();
      const validRoles = ['planner', 'coder', 'tester', 'reviewer', 'explorer', 'researcher', 'analyst', 'writer', 'all'];

      if (!validRoles.includes(role)) {
        setError(`Unknown agent "${role}". Valid: ${validRoles.join(', ')}`);
        return;
      }

      onSubmit(role, instruction);
      return;
    }

    if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      setError(null);
      return;
    }

    if (char) {
      setInput((prev) => prev + char);
      setError(null);
    }
  });

  return (
    <Box flexDirection="column" marginY={1}>
      <Divider length={62} marginY={0} />

      <Box flexDirection="row">
        <Text color={noColor ? undefined : chatterboxAnsi.brand} bold>
          STEER AGENT · @mention
        </Text>
      </Box>

      <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>
        Enter instruction for agent (e.g. @coder add type validation or @planner revise approach):
      </Text>

      <Box flexDirection="row" marginTop={1}>
        <Text color={noColor ? undefined : chatterboxAnsi.brand} bold>
          {'> '}
        </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>
          {input}
        </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.brand} bold>
          _
        </Text>
      </Box>

      {error && (
        <Box marginTop={0}>
          <Text color={noColor ? undefined : chatterboxAnsi.error}>
            ⚠ {error}
          </Text>
        </Box>
      )}

      <Divider length={62} marginY={0} />
      <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
        Enter submit · Esc cancel
      </Text>
    </Box>
  );
};
