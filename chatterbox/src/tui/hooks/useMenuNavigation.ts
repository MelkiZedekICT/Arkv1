import { useState, useCallback } from 'react';

export interface MenuNavigationState<T extends string = string> {
  selectedIndex: number;
  items: readonly T[];
  selectedItem: T;
  moveUp: () => void;
  moveDown: () => void;
  select: (index: number) => void;
}

/**
 * Hook for arrow-key menu navigation.
 * Returns the current selection index and navigation functions.
 */
export function useMenuNavigation<T extends string = string>(
  items: readonly T[],
  initialIndex = 0
): MenuNavigationState<T> {
  const [selectedIndex, setSelectedIndex] = useState(
    Math.min(initialIndex, Math.max(0, items.length - 1))
  );

  const moveUp = useCallback(() => {
    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
  }, [items.length]);

  const moveDown = useCallback(() => {
    setSelectedIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
  }, [items.length]);

  const select = useCallback((index: number) => {
    setSelectedIndex(Math.min(index, Math.max(0, items.length - 1)));
  }, [items.length]);

  return {
    selectedIndex,
    items,
    selectedItem: items[selectedIndex] ?? items[0],
    moveUp,
    moveDown,
    select,
  };
}
