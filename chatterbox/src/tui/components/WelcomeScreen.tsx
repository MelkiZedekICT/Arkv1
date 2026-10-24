import React from 'react';
import { Box, Text, useInput, useApp, useStdin } from 'ink';
import { ChatterboxLogo } from './ChatterboxLogo.js';
import { Divider } from './Divider.js';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';
import { symbols } from '../design/symbols.js';
import { useMenuNavigation } from '../hooks/useMenuNavigation.js';

export type WelcomeAction =
  | 'demo'
  | 'setup'
  | 'start'
  | 'tasks'
  | 'settings'
  | 'exit';

interface MenuItem {
  id: WelcomeAction;
  label: string;
  hint?: string;
}

export interface WelcomeScreenProps {
  version: string;
  providerConfigured: boolean;
  providerName?: string;
  modelName?: string;
  onSelect: (action: WelcomeAction) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  version,
  providerConfigured,
  providerName,
  modelName,
  onSelect,
}) => {
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();
  const noColor = isNoColor();

  const menuItems: MenuItem[] = providerConfigured
    ? [
        { id: 'demo', label: 'Try the demo' },
        { id: 'start', label: 'Start a task' },
        { id: 'setup', label: 'Set up AI provider' },
        { id: 'tasks', label: 'View recent tasks' },
        { id: 'settings', label: 'Open settings' },
        { id: 'exit', label: 'Exit' },
      ]
    : [
        { id: 'demo', label: 'Try the demo', hint: 'works offline, no API key needed' },
        { id: 'setup', label: 'Set up AI provider' },
        { id: 'start', label: 'Start a task' },
        { id: 'tasks', label: 'View recent tasks' },
        { id: 'settings', label: 'Open settings' },
        { id: 'exit', label: 'Exit' },
      ];

  const ids = menuItems.map((m) => m.id);
  const defaultIdx = providerConfigured ? 1 : 0; // "Start a task" if configured, "Try demo" otherwise
  const nav = useMenuNavigation(ids, defaultIdx);

  useInput((input, key) => {
    if (key.upArrow) {
      nav.moveUp();
      return;
    }
    if (key.downArrow) {
      nav.moveDown();
      return;
    }
    if (key.return) {
      const selected = nav.selectedItem;
      if (selected === 'exit') {
        exit();
        return;
      }
      onSelect(selected);
      return;
    }
    if (input.toLowerCase() === 'q') {
      exit();
    }
  }, { isActive: Boolean(isRawModeSupported && process.stdin.isTTY) });

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {/* Logo + version */}
      <ChatterboxLogo variant="compact" version={version} />
      <Box marginTop={1}>
        <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>
          More minds. Better conversations.
        </Text>
      </Box>
      <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
        Terminal-native multiplayer control room for AI coding-agent teams.
      </Text>

      {/* Provider/Model status */}
      <Box flexDirection="column" marginTop={1}>
        <Box flexDirection="row">
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>{'  Provider:  '}</Text>
          {providerConfigured ? (
            <>
              <Text color={noColor ? undefined : chatterboxAnsi.success}>{symbols.status.done} </Text>
              <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>{providerName ?? 'Configured'}</Text>
            </>
          ) : (
            <>
              <Text color={noColor ? undefined : chatterboxAnsi.error}>{symbols.status.failed} </Text>
              <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>Not configured</Text>
            </>
          )}
        </Box>
        <Box flexDirection="row">
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>{'  Model:     '}</Text>
          {modelName ? (
            <>
              <Text color={noColor ? undefined : chatterboxAnsi.success}>{symbols.status.done} </Text>
              <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>{modelName}</Text>
            </>
          ) : (
            <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>– Not selected</Text>
          )}
        </Box>
      </Box>

      <Divider length={62} marginY={0} />

      {/* Menu */}
      <Box marginTop={1}>
        <Text color={noColor ? undefined : chatterboxAnsi.textPrimary} bold>
          What would you like to do?
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {menuItems.map((item, idx) => {
          const isSelected = idx === nav.selectedIndex;
          return (
            <Box key={item.id} flexDirection="row">
              <Text color={noColor ? undefined : (isSelected ? chatterboxAnsi.brand : chatterboxAnsi.textMuted)}>
                {isSelected ? '  ▸ ' : '    '}
              </Text>
              <Text
                color={noColor ? undefined : (isSelected ? chatterboxAnsi.textPrimary : chatterboxAnsi.textSecondary)}
                bold={isSelected}
              >
                {item.label}
              </Text>
              {item.hint && (
                <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
                  {'  '}({item.hint})
                </Text>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Navigation hint */}
      <Box marginTop={1}>
        <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
          ↑/↓ navigate · Enter select
        </Text>
      </Box>
    </Box>
  );
};
