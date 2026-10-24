import React from 'react';
import { Box, Text, useInput, useStdin } from 'ink';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';
import { useMenuNavigation } from '../hooks/useMenuNavigation.js';

const AGENT_ROLES = ['explorer', 'planner', 'coder', 'tester', 'reviewer'] as const;
type AgentRoleOption = typeof AGENT_ROLES[number];

export interface AgentSelectorProps {
  onSelect: (role: string) => void;
  onCancel: () => void;
}

export const AgentSelector: React.FC<AgentSelectorProps> = ({ onSelect, onCancel }) => {
  const noColor = isNoColor();
  const { isRawModeSupported } = useStdin();
  const roles: AgentRoleOption[] = [...AGENT_ROLES];
  const nav = useMenuNavigation(roles, 0);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.upArrow) { nav.moveUp(); return; }
    if (key.downArrow) { nav.moveDown(); return; }
    if (key.return) {
      onSelect(nav.selectedItem);
      return;
    }
    // Quick jump: first letter of role
    const lower = input.toLowerCase();
    const idx = roles.findIndex((r) => r.startsWith(lower));
    if (idx >= 0) {
      nav.select(idx);
    }
  }, { isActive: Boolean(isRawModeSupported && process.stdin.isTTY) });

  return (
    <Box flexDirection="column" marginTop={0}>
      <Text color={noColor ? undefined : chatterboxAnsi.textPrimary} bold>
        Select agent:
      </Text>
      <Box flexDirection="column" marginTop={0}>
        {roles.map((role, idx) => {
          const isSelected = idx === nav.selectedIndex;
          return (
            <Box key={role} flexDirection="row">
              <Text color={noColor ? undefined : (isSelected ? chatterboxAnsi.brand : chatterboxAnsi.textMuted)}>
                {isSelected ? '  ▸ ' : '    '}
              </Text>
              <Text
                color={noColor ? undefined : (isSelected ? chatterboxAnsi.textPrimary : chatterboxAnsi.textSecondary)}
                bold={isSelected}
              >
                {role.charAt(0).toUpperCase() + role.slice(1)}
              </Text>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={0}>
        <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
          ↑/↓ navigate · Enter select · Esc cancel
        </Text>
      </Box>
    </Box>
  );
};
