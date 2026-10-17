import React from 'react';
import { Box, Text } from 'ink';
import { FeedItem } from '../hooks/useAgentFeedEvents.js';
import { EventLine } from './EventLine.js';

export interface AgentFeedProps {
  items: FeedItem[];
  maxVisible?: number;
}

export const AgentFeed: React.FC<AgentFeedProps> = ({
  items,
  maxVisible = 10,
}) => {
  const visibleItems = items.slice(-maxVisible);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
      minHeight={10}
    >
      <Box marginBottom={0}>
        <Text bold color="cyan">
          AGENT FEED
        </Text>
      </Box>
      {visibleItems.length === 0 ? (
        <Text dimColor>Waiting for agent messages...</Text>
      ) : (
        visibleItems.map((item) => <EventLine key={item.id} item={item} />)
      )}
    </Box>
  );
};
