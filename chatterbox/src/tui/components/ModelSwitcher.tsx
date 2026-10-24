import React from 'react';
import { Box, Text, useInput, useStdin } from 'ink';
import { Divider } from './Divider.js';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';
import { useMenuNavigation } from '../hooks/useMenuNavigation.js';

interface ModelOption {
  provider: string;
  model: string;
  isCurrent: boolean;
}

export interface ModelSwitcherProps {
  currentProvider: string;
  currentModel: string;
  options: ModelOption[];
  onSelect: (provider: string, model: string) => void;
  onCancel: () => void;
}

export const ModelSwitcher: React.FC<ModelSwitcherProps> = ({
  currentProvider,
  currentModel,
  options,
  onSelect,
  onCancel,
}) => {
  const noColor = isNoColor();
  const { isRawModeSupported } = useStdin();
  const optionLabels = options.map((o) => `${o.provider}|${o.model}`);
  const currentIdx = options.findIndex((o) => o.isCurrent);
  const nav = useMenuNavigation(optionLabels, currentIdx >= 0 ? currentIdx : 0);

  useInput((_input, key) => {
    if (key.escape) { onCancel(); return; }
    if (key.upArrow) { nav.moveUp(); return; }
    if (key.downArrow) { nav.moveDown(); return; }
    if (key.return) {
      const selected = options[nav.selectedIndex];
      if (selected) {
        onSelect(selected.provider, selected.model);
      }
      return;
    }
  }, { isActive: Boolean(isRawModeSupported && process.stdin.isTTY) });

  return (
    <Box flexDirection="column">
      <Divider length={62} marginY={0} />
      <Box flexDirection="row" marginTop={0}>
        <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>/model</Text>
      </Box>
      <Box flexDirection="row">
        <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>Active: </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textPrimary} bold>
          {currentProvider} · {currentModel}
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color={noColor ? undefined : chatterboxAnsi.textPrimary} bold>
          Select provider and model:
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={0}>
        {options.map((opt, idx) => {
          const isSelected = idx === nav.selectedIndex;
          return (
            <Box key={`${opt.provider}-${opt.model}`} flexDirection="row">
              <Text color={noColor ? undefined : (isSelected ? chatterboxAnsi.brand : chatterboxAnsi.textMuted)}>
                {isSelected ? '  ▸ ' : '    '}
              </Text>
              <Text
                color={noColor ? undefined : (isSelected ? chatterboxAnsi.textPrimary : chatterboxAnsi.textSecondary)}
                bold={isSelected}
              >
                {opt.provider}
              </Text>
              <Text color={noColor ? undefined : chatterboxAnsi.textMuted}> · </Text>
              <Text
                color={noColor ? undefined : (isSelected ? chatterboxAnsi.textPrimary : chatterboxAnsi.textSecondary)}
              >
                {opt.model}
              </Text>
              {opt.isCurrent && (
                <Text color={noColor ? undefined : chatterboxAnsi.brand}> ← current</Text>
              )}
            </Box>
          );
        })}
      </Box>

      <Box marginTop={0}>
        <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
          ↑/↓ navigate · Enter select · Esc cancel
        </Text>
      </Box>
      <Divider length={62} marginY={0} />
    </Box>
  );
};
