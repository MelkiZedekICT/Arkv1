import React from 'react';
import { Box, Text, useInput } from 'ink';
import { existsSync, readFileSync } from 'fs';
import { ArtifactState } from '../hooks/useAgentFeedEvents.js';
import { Divider } from './Divider.js';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';

export interface ArtifactViewerProps {
  artifact: ArtifactState | null;
  onClose: () => void;
}

export const ArtifactViewer: React.FC<ArtifactViewerProps> = ({ artifact, onClose }) => {
  const noColor = isNoColor();

  useInput((input, key) => {
    if (key.escape || input.toLowerCase() === 'q' || input.toLowerCase() === 'v') {
      onClose();
    }
  });

  if (!artifact) {
    return (
      <Box flexDirection="column" marginY={1}>
        <Divider length={62} marginY={0} />
        <Text color={noColor ? undefined : chatterboxAnsi.brand} bold>
          ARTIFACT VIEWER
        </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
          No artifacts created yet for this task.
        </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>
          Press V or Esc to close.
        </Text>
        <Divider length={62} marginY={0} />
      </Box>
    );
  }

  let contentPreview = 'Artifact file not found on disk.';
  if (existsSync(artifact.path)) {
    try {
      const raw = readFileSync(artifact.path, 'utf-8');
      const lines = raw.split('\n');
      contentPreview = lines.slice(0, 16).join('\n');
      if (lines.length > 16) {
        contentPreview += `\n... (${lines.length - 16} more lines in ${artifact.path})`;
      }
    } catch {
      contentPreview = 'Error reading artifact file.';
    }
  }

  return (
    <Box flexDirection="column" marginY={0}>
      <Divider length={62} marginY={0} />
      <Box flexDirection="row" justifyContent="space-between">
        <Text color={noColor ? undefined : chatterboxAnsi.brand} bold>
          ARTIFACT: {artifact.title}
        </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
          [V or Esc to close]
        </Text>
      </Box>
      <Box marginY={0}>
        <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>
          Path: {artifact.path}
        </Text>
      </Box>
      <Box marginY={0}>
        <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>
          {contentPreview}
        </Text>
      </Box>
      <Divider length={62} marginY={0} />
    </Box>
  );
};
