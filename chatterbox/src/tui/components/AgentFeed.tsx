import React from 'react';
import { Box, Text } from 'ink';
import { FeedItem } from '../hooks/useAgentFeedEvents.js';
import { MessageSelector } from './MessageSelector.js';
import { Divider } from './Divider.js';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';

export interface AgentFeedProps {
  items: FeedItem[];
  maxVisible?: number;
  activeRole?: string;
  activeDescription?: string;
  selectedIndex?: number;
  isSelecting?: boolean;
}

export const AgentFeed: React.FC<AgentFeedProps> = ({
  items,
  maxVisible = 8,
  activeRole,
  activeDescription,
  selectedIndex = -1,
  isSelecting = false,
}) => {
  const noColor = isNoColor();

  return (
    <Box flexDirection="column" marginY={0}>
      {/* ACTIVE Indicator Banner */}
      {activeRole && (
        <Box flexDirection="column" marginY={0}>
          <Box flexDirection="row">
            <Text color={noColor ? undefined : chatterboxAnsi.brand} bold>
              ACTIVE: [{activeRole.toUpperCase()}]{' '}
            </Text>
            <Text color={noColor ? undefined : chatterboxAnsi.textPrimary} bold>
              {activeDescription || 'Executing operations...'}
            </Text>
          </Box>
          <Divider length={62} marginY={0} />
        </Box>
      )}

      {/* Live Agent Stream */}
      <MessageSelector
        items={items}
        selectedIndex={selectedIndex}
        isSelecting={isSelecting}
        maxVisible={maxVisible}
      />
    </Box>
  );
};
