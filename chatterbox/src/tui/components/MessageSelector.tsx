import React from 'react';
import { Box, Text } from 'ink';
import { FeedItem } from '../hooks/useAgentFeedEvents.js';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';

export interface MessageSelectorProps {
  items: FeedItem[];
  selectedIndex: number;
  isSelecting: boolean;
  maxVisible?: number;
}

export const MessageSelector: React.FC<MessageSelectorProps> = ({
  items,
  selectedIndex,
  isSelecting,
  maxVisible = 8,
}) => {
  const noColor = isNoColor();
  const visibleItems = items.slice(-maxVisible);
  // Calculate relative selected index within visible items window
  const offset = Math.max(0, items.length - maxVisible);
  const visibleSelectedIndex = selectedIndex - offset;

  if (visibleItems.length === 0) {
    return (
      <Box minHeight={4}>
        <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
          Awaiting specialist agent activity...
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" minHeight={4}>
      {visibleItems.map((item, idx) => {
        const isSelected = isSelecting && idx === visibleSelectedIndex;
        const role = (item.role || 'system').toUpperCase();
        const roleColor = item.kind === 'error'
          ? chatterboxAnsi.error
          : isSelected
          ? chatterboxAnsi.brand
          : chatterboxAnsi.textSecondary;
        const textColor = item.kind === 'error'
          ? chatterboxAnsi.error
          : isSelected
          ? chatterboxAnsi.textPrimary
          : chatterboxAnsi.textSecondary;

        const singleLine = item.content.replace(/\r?\n/g, ' ').trim();
        const maxWidth = 90;
        const truncated = singleLine.length > maxWidth ? `${singleLine.slice(0, maxWidth - 3)}...` : singleLine;

        return (
          <Box key={item.id || idx} flexDirection="row">
            <Text color={noColor ? undefined : (isSelected ? chatterboxAnsi.brand : chatterboxAnsi.textMuted)} bold={isSelected}>
              {isSelected ? '▸ ' : '  '}
            </Text>
            <Text color={noColor ? undefined : roleColor} bold>
              [{role}]
            </Text>
            <Text> </Text>
            <Text color={noColor ? undefined : textColor} bold={isSelected}>
              {truncated}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};
