import React, { useState } from 'react';
import { Box, Text, useInput, useStdin } from 'ink';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';

export interface ChatInputProps {
  onSubmit: (message: string) => void;
  onMentionRequest: () => void;
  onSlashCommand: (command: string) => void;
  placeholder?: string;
  targetAgent?: string;
  disabled?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSubmit,
  onMentionRequest,
  onSlashCommand,
  placeholder = 'Type a message, @mention an agent, or use a shortcut.',
  targetAgent,
  disabled = false,
}) => {
  const noColor = isNoColor();
  const { isRawModeSupported } = useStdin();
  const [value, setValue] = useState('');

  useInput((input, key) => {
    if (disabled) return;

    if (key.return) {
      const trimmed = value.trim();
      if (trimmed.length === 0) return;

      // Handle slash commands
      if (trimmed.startsWith('/')) {
        onSlashCommand(trimmed);
        setValue('');
        return;
      }

      onSubmit(trimmed);
      setValue('');
      return;
    }

    if (key.backspace || key.delete) {
      setValue((prev) => prev.slice(0, -1));
      return;
    }

    if (key.escape) {
      setValue('');
      return;
    }

    if (input) {
      // Detect @ at beginning or after space to trigger mention
      if (input === '@' && (value.length === 0 || value.endsWith(' '))) {
        onMentionRequest();
        return;
      }

      setValue((prev) => prev + input);
    }
  }, { isActive: !disabled && Boolean(isRawModeSupported && process.stdin.isTTY) });

  const prompt = targetAgent ? `@${targetAgent}` : '>';

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Text color={noColor ? undefined : chatterboxAnsi.brand} bold>
          {prompt}{' '}
        </Text>
        {value.length > 0 ? (
          <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>{value}</Text>
        ) : (
          <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>{placeholder}</Text>
        )}
        <Text color={noColor ? undefined : chatterboxAnsi.brand} bold>
          {value.length > 0 ? '_' : ''}
        </Text>
      </Box>
    </Box>
  );
};
