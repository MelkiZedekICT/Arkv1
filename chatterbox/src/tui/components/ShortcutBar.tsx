import React from 'react';
import { Box, Text } from 'ink';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';

export interface ShortcutItem {
  keyLabel?: string;
  action?: string;
  key?: string;
  label?: string;
  color?: 'yellow' | 'green' | 'red' | 'white' | 'gray';
}

export interface ShortcutBarProps {
  shortcuts: ShortcutItem[];
  rightStatus?: {
    text: string;
    color?: 'yellow' | 'green' | 'red' | 'gray';
  };
}

export const ShortcutBar: React.FC<ShortcutBarProps> = ({ shortcuts, rightStatus }) => {
  const noColor = isNoColor();

  return (
    <Box flexDirection="row" justifyContent="space-between" marginY={0}>
      <Box flexDirection="row">
        {shortcuts.map((sc, idx) => {
          const keyText = sc.keyLabel || sc.key || '';
          const actionText = sc.action || sc.label || '';
          return (
            <React.Fragment key={idx}>
              {idx > 0 && <Text color={noColor ? undefined : chatterboxAnsi.textMuted}> · </Text>}
              <Text color={noColor ? undefined : (sc.color || chatterboxAnsi.brand)} bold>
                {keyText}
              </Text>
              <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}> {actionText}</Text>
            </React.Fragment>
          );
        })}
      </Box>

      {rightStatus && (
        <Box>
          <Text color={noColor ? undefined : (rightStatus.color || 'yellow')} bold>
            [{rightStatus.text}]
          </Text>
        </Box>
      )}
    </Box>
  );
};
