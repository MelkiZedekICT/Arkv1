import React from 'react';
import { Box, Text } from 'ink';
import { FeedItem } from '../hooks/useAgentFeedEvents.js';
import { EventLine } from './EventLine.js';
import { Divider } from './Divider.js';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';

export interface AgentFeedProps {
  items: FeedItem[];
  maxVisible?: number;
  activeRole?: string;
  activeDescription?: string;
}

export const AgentFeed: React.FC<AgentFeedProps> = ({
  items,
  maxVisible = 8,
  activeRole,
  activeDescription,
}) => {
  const noColor = isNoColor();
  const visibleItems = items.slice(-maxVisible);

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
      <Box flexDirection="column" minHeight={4}>
        {visibleItems.length === 0 ? (
          <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
            Awaiting specialist agent activity...
          </Text>
        ) : (
          visibleItems.map((item) => <EventLine key={item.id} item={item} />)
        )}
      </Box>
    </Box>
  );
};
