import { useState, useCallback } from 'react';
import { FeedItem } from './useAgentFeedEvents.js';

export interface MessageSelectionState {
  selectedIndex: number;
  isSelecting: boolean;
  selectedItem: FeedItem | null;
  enterSelectionMode: () => void;
  exitSelectionMode: () => void;
  moveUp: (items: FeedItem[]) => void;
  moveDown: (items: FeedItem[]) => void;
}

/**
 * Hook for selecting individual agent messages in the feed.
 * Manages the selection index and mode transition.
 */
export function useMessageSelection(): MessageSelectionState {
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedItem, setSelectedItem] = useState<FeedItem | null>(null);

  const enterSelectionMode = useCallback(() => {
    setIsSelecting(true);
    setSelectedIndex(0);
  }, []);

  const exitSelectionMode = useCallback(() => {
    setIsSelecting(false);
    setSelectedIndex(-1);
    setSelectedItem(null);
  }, []);

  const moveUp = useCallback((items: FeedItem[]) => {
    setSelectedIndex((prev) => {
      const next = prev > 0 ? prev - 1 : items.length - 1;
      setSelectedItem(items[next] ?? null);
      return next;
    });
  }, []);

  const moveDown = useCallback((items: FeedItem[]) => {
    setSelectedIndex((prev) => {
      const next = prev < items.length - 1 ? prev + 1 : 0;
      setSelectedItem(items[next] ?? null);
      return next;
    });
  }, []);

  return {
    selectedIndex,
    isSelecting,
    selectedItem,
    enterSelectionMode,
    exitSelectionMode,
    moveUp,
    moveDown,
  };
}
