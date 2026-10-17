import React from 'react';
import { Box, Text } from 'ink';
import { FeedItem } from '../hooks/useAgentFeedEvents.js';
import { AgentAvatar } from './AgentAvatar.js';

export interface EventLineProps {
  item: FeedItem;
}

export const EventLine: React.FC<EventLineProps> = ({ item }) => {
  // Render content and highlight @mentions
  const renderContentWithMentions = (text: string) => {
    const parts = text.split(/(@[a-zA-Z0-9_-]+)/g);
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        return (
          <Text key={index} color="cyanBright" bold>
            {part}
          </Text>
        );
      }
      return <Text key={index}>{part}</Text>;
    });
  };

  return (
    <Box flexDirection="row">
      <Text dimColor>{item.timestamp} </Text>
      <AgentAvatar role={item.role} />
      <Text> </Text>
      {renderContentWithMentions(item.content)}
    </Box>
  );
};
