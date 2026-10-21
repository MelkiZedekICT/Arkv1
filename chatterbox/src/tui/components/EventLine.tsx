import React from 'react';
import { FeedItem } from '../hooks/useAgentFeedEvents.js';
import { AgentLine } from './AgentLine.js';

export interface EventLineProps {
  item: FeedItem;
  maxWidth?: number;
}

export const EventLine: React.FC<EventLineProps> = ({ item, maxWidth = 100 }) => {
  return (
    <AgentLine
      role={item.role || 'system'}
      message={item.content}
      kind={item.kind}
      timestamp={item.timestamp}
      maxWidth={maxWidth}
    />
  );
};
