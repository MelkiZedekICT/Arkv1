import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Divider } from './Divider.js';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';
import { ActiveChangesetState } from '../hooks/useAgentFeedEvents.js';

export interface DiffViewerProps {
  diff?: string;
  filePath?: string;
  changeset?: ActiveChangesetState | null;
  mode?: string;
  onApprove?: (changesetId: string) => void | Promise<void>;
  onReject?: (changesetId: string, reason?: string) => void | Promise<void>;
  onClose: () => void;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  diff,
  filePath,
  changeset,
  onApprove,
  onReject,
  onClose,
}) => {
  const noColor = isNoColor();
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const maxLinesVisible = 14;

  const files = changeset?.diffs ?? [];
  const activeFile = files.length > 0 ? files[Math.min(activeFileIndex, files.length - 1)] : null;
  const activeDiff = activeFile ? activeFile.diffSnippet : diff ?? '';
  const currentPath = activeFile ? activeFile.filePath : filePath || 'file';

  const isStale =
    changeset?.status === 'stale' ||
    Boolean(changeset?.staleFiles && changeset.staleFiles.length > 0);

  useInput((input, key) => {
    const char = input.toLowerCase();

    if (key.escape || char === 'v' || char === 'q') {
      onClose();
      return;
    }

    if (key.upArrow || char === 'k') {
      setScrollOffset((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow || char === 'j') {
      setScrollOffset((prev) => prev + 1);
      return;
    }

    if (char === 'n' && files.length > 1) {
      setActiveFileIndex((prev) => (prev + 1) % files.length);
      setScrollOffset(0);
      return;
    }

    if (char === 'p' && files.length > 1) {
      setActiveFileIndex((prev) => (prev - 1 + files.length) % files.length);
      setScrollOffset(0);
      return;
    }

    if (char === 'a' && onApprove && changeset) {
      void onApprove(changeset.changesetId);
      return;
    }

    if (char === 'r' && onReject && changeset) {
      void onReject(changeset.changesetId, 'Rejected by operator in diff viewer');
      return;
    }
  });

  // Empty state
  if ((!changeset || files.length === 0) && (!activeDiff || activeDiff.trim().length === 0)) {
    return (
      <Box flexDirection="column" marginY={1}>
        <Divider length={62} marginY={0} />
        <Text color={noColor ? undefined : chatterboxAnsi.brand} bold>
          DIFF VIEWER
        </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
          No unified diff available to display.
        </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>
          Press V or Esc to close.
        </Text>
        <Divider length={62} marginY={0} />
      </Box>
    );
  }

  // Stale Changeset Alert
  if (isStale) {
    return (
      <Box flexDirection="column" marginY={1}>
        <Divider length={62} marginY={0} />
        <Box flexDirection="row">
          <Text color={noColor ? undefined : chatterboxAnsi.warning} bold>
            ⚠ CHANGESET STALE
          </Text>
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>
            {' '}· {changeset?.changesetId || 'current'}
          </Text>
        </Box>
        <Divider length={62} marginY={0} />
        <Box flexDirection="column" marginY={0}>
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>
            Target: {currentPath}
          </Text>
          <Text color={noColor ? undefined : chatterboxAnsi.warning}>
            Reason: File on disk was modified after diff generation.
          </Text>
          <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
            Action: A new changeset or rebase is required by quality gates.
          </Text>
        </Box>
        <Divider length={62} marginY={0} />
        <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>
          Esc close
        </Text>
      </Box>
    );
  }

  const allLines = activeDiff.split('\n');
  const visibleLines = allLines.slice(scrollOffset, scrollOffset + maxLinesVisible);
  const totalFiles = files.length || 1;
  const currentFileNumber = activeFileIndex + 1;
  const additions = activeFile ? activeFile.additions : (changeset?.additions ?? 0);
  const deletions = activeFile ? activeFile.deletions : (changeset?.deletions ?? 0);

  return (
    <Box flexDirection="column" marginY={1}>
      <Divider length={62} marginY={0} />

      {/* Header */}
      <Box flexDirection="row">
        <Text color={noColor ? undefined : chatterboxAnsi.brand} bold>
          CHANGESET {changeset?.changesetId || 'active'}
        </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>
          {' '}· File {currentFileNumber} of {totalFiles} · +{additions} / -{deletions} lines
        </Text>
      </Box>

      <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>
        File: {currentPath}
      </Text>

      <Divider length={62} marginY={0} />

      {/* Unified Diff content */}
      <Box flexDirection="column">
        {visibleLines.map((line, idx) => {
          const isAdd = line.startsWith('+') && !line.startsWith('+++');
          const isDel = line.startsWith('-') && !line.startsWith('---');
          const isHunk = line.startsWith('@@') || line.startsWith('---') || line.startsWith('+++');

          const lineCol = isAdd
            ? chatterboxAnsi.success
            : isDel
              ? chatterboxAnsi.error
              : isHunk
                ? chatterboxAnsi.brand
                : chatterboxAnsi.textSecondary;

          return (
            <Text key={idx} color={noColor ? undefined : lineCol}>
              {line}
            </Text>
          );
        })}
      </Box>

      {allLines.length > maxLinesVisible && (
        <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
          [lines {scrollOffset + 1}-{Math.min(scrollOffset + maxLinesVisible, allLines.length)} of {allLines.length}]
        </Text>
      )}

      <Divider length={62} marginY={0} />

      {/* Navigation shortcuts */}
      <Box flexDirection="row">
        <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>
          ↑/↓ scroll ·{' '}
        </Text>
        {totalFiles > 1 && (
          <>
            <Text color={noColor ? undefined : chatterboxAnsi.brand} bold>
              N
            </Text>
            <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}> next file · </Text>
            <Text color={noColor ? undefined : chatterboxAnsi.brand} bold>
              P
            </Text>
            <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}> prev file · </Text>
          </>
        )}
        {onApprove && changeset && (
          <>
            <Text color={noColor ? undefined : chatterboxAnsi.success} bold>
              A
            </Text>
            <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}> approve · </Text>
            <Text color={noColor ? undefined : chatterboxAnsi.error} bold>
              R
            </Text>
            <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}> reject · </Text>
          </>
        )}
        <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
          V close
        </Text>
      </Box>
    </Box>
  );
};
