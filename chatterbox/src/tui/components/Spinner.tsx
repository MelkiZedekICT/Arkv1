import React, { useState, useEffect } from 'react';
import { Text } from 'ink';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export interface SpinnerProps {
  color?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ color = 'cyan' }) => {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % FRAMES.length);
    }, 80);

    return () => clearInterval(timer);
  }, []);

  return <Text color={color}>{FRAMES[frameIndex]} </Text>;
};
