import React from 'react';
import { Box, Text } from 'ink';
import { existsSync, readFileSync } from 'fs';
import { ArtifactState } from '../hooks/useAgentFeedEvents.js';

export interface ArtifactViewerProps {
  artifact: ArtifactState | null;
  onClose: () => void;
}

export const ArtifactViewer: React.FC<ArtifactViewerProps> = ({ artifact }) => {
  if (!artifact) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="magenta"
        paddingX={1}
      >
        <Text bold color="magenta">
          ARTIFACT VIEWER
        </Text>
        <Text dimColor>No artifacts created yet for this task.</Text>
        <Text dimColor>Press [V] to close.</Text>
      </Box>
    );
  }

  let contentPreview = 'Artifact file not found on disk.';
  if (existsSync(artifact.path)) {
    try {
      const raw = readFileSync(artifact.path, 'utf-8');
      const lines = raw.split('\n');
      contentPreview = lines.slice(0, 20).join('\n');
      if (lines.length > 20) {
        contentPreview += `\n... (${lines.length - 20} more lines in ${artifact.path})`;
      }
    } catch {
      contentPreview = 'Error reading artifact file.';
    }
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="magenta"
      paddingX={1}
    >
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold color="magenta">
          ARTIFACT PREVIEW: {artifact.title}
        </Text>
        <Text dimColor>Press [V] to close</Text>
      </Box>
      <Box marginY={0}>
        <Text dimColor>Path: {artifact.path}</Text>
      </Box>
      <Box marginY={0}>
        <Text color="white">{contentPreview}</Text>
      </Box>
    </Box>
  );
};
