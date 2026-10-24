import React from 'react';
import { Box, Text, useInput, useStdin } from 'ink';
import { Divider } from './Divider.js';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';
import { useMenuNavigation } from '../hooks/useMenuNavigation.js';
import { FeedItem } from '../hooks/useAgentFeedEvents.js';

type MessageActionId =
  | 'approve'
  | 'reject'
  | 'ask'
  | 'revise'
  | 'redirect'
  | 'viewdiff'
  | 'copy'
  | 'copypath'
  | 'back';

interface ActionMenuItem {
  id: MessageActionId;
  label: string;
}

const ALL_ACTIONS: ActionMenuItem[] = [
  { id: 'approve', label: 'Approve' },
  { id: 'reject', label: 'Reject' },
  { id: 'ask', label: 'Ask a question' },
  { id: 'revise', label: 'Request revision' },
  { id: 'redirect', label: 'Redirect to another agent' },
  { id: 'viewdiff', label: 'View diff' },
  { id: 'copy', label: 'Copy message' },
  { id: 'copypath', label: 'Copy file path' },
  { id: 'back', label: 'Back' },
];

export interface MessageActionsProps {
  item: FeedItem;
  onAction: (action: MessageActionId, item: FeedItem) => void;
  onClose: () => void;
}

export const MessageActions: React.FC<MessageActionsProps> = ({
  item,
  onAction,
  onClose,
}) => {
  const noColor = isNoColor();
  const { isRawModeSupported } = useStdin();
  const actionIds = ALL_ACTIONS.map((a) => a.id);
  const nav = useMenuNavigation(actionIds, 0);

  useInput((input, key) => {
    if (key.escape) { onClose(); return; }
    if (key.upArrow) { nav.moveUp(); return; }
    if (key.downArrow) { nav.moveDown(); return; }
    if (key.return) {
      const selected = nav.selectedItem;
      if (selected === 'back') { onClose(); return; }
      onAction(selected, item);
      return;
    }
    // Quick keys
    const lower = input.toLowerCase();
    if (lower === 'a') { onAction('approve', item); return; }
    if (lower === 'r') { onAction('reject', item); return; }
  }, { isActive: Boolean(isRawModeSupported && process.stdin.isTTY) });

  const roleTag = item.role?.toUpperCase() || 'AGENT';
  const contentPreview = item.content.length > 60
    ? item.content.slice(0, 57) + '…'
    : item.content;

  return (
    <Box flexDirection="column">
      <Divider length={62} marginY={0} />
      <Box flexDirection="column" marginTop={0}>
        <Box flexDirection="row">
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>Message from </Text>
          <Text color={noColor ? undefined : chatterboxAnsi.textPrimary} bold>{roleTag}</Text>
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>:</Text>
        </Box>
        <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>  {contentPreview}</Text>
      </Box>

      <Box marginTop={1}>
        <Text color={noColor ? undefined : chatterboxAnsi.textPrimary} bold>
          What would you like to do?
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={0}>
        {ALL_ACTIONS.map((action, idx) => {
          const isSelected = idx === nav.selectedIndex;
          return (
            <Box key={action.id} flexDirection="row">
              <Text color={noColor ? undefined : (isSelected ? chatterboxAnsi.brand : chatterboxAnsi.textMuted)}>
                {isSelected ? '  ▸ ' : '    '}
              </Text>
              <Text
                color={noColor ? undefined : (isSelected ? chatterboxAnsi.textPrimary : chatterboxAnsi.textSecondary)}
                bold={isSelected}
              >
                {action.label}
              </Text>
            </Box>
          );
        })}
      </Box>

      <Box marginTop={0}>
        <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
          ↑/↓ navigate · Enter select · A approve · R reject · Esc cancel
        </Text>
      </Box>
      <Divider length={62} marginY={0} />
    </Box>
  );
};
