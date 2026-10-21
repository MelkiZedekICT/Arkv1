import React, { useState, useEffect } from 'react';
import { Text } from 'ink';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';
import { symbols } from '../design/symbols.js';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export interface SpinnerProps {
  color?: string;
  staticFallback?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({
  color,
  staticFallback = symbols.status.active,
}) => {
  const isReducedMotion = process.env.REDUCED_MOTION === '1';
  const noColor = isNoColor();
  const effectiveColor = noColor ? undefined : color || chatterboxAnsi.brand;

  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (isReducedMotion) {
      return;
    }

    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % FRAMES.length);
    }, 80);

    return () => clearInterval(timer);
  }, [isReducedMotion]);

  if (isReducedMotion) {
    return <Text color={effectiveColor}>{staticFallback} </Text>;
  }

  return <Text color={effectiveColor}>{FRAMES[frameIndex]} </Text>;
};
