import React from 'react';
import { Box, Text } from 'ink';
import { PendingApprovalState } from '../hooks/useAgentFeedEvents.js';
import { Divider } from './Divider.js';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';

export interface ApprovalPromptProps {
  approval: PendingApprovalState;
}

export const ApprovalPrompt: React.FC<ApprovalPromptProps> = ({ approval }) => {
  const noColor = isNoColor();

  const targetPath = approval.targetPath || approval.target;
  const role = approval.agentRole || 'coder';
  const action = approval.action || 'edit_file';
  const mode = approval.mode || 'supervised';

  return (
    <Box flexDirection="column" marginY={1}>
      <Divider length={62} marginY={0} />

      {/* Warning Header */}
      <Box flexDirection="row">
        <Text color={noColor ? undefined : chatterboxAnsi.warning} bold>
          ⚠ APPROVAL REQUIRED
        </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>
          {' '}· {role} · {action} · {mode}
        </Text>
      </Box>

      <Divider length={62} marginY={0} />

      {/* Target & Impact Metadata */}
      <Box flexDirection="column" marginY={0}>
        {targetPath && (
          <Box flexDirection="row">
            <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>Target: </Text>
            <Text color={noColor ? undefined : chatterboxAnsi.textPrimary} bold>
              {targetPath}
            </Text>
          </Box>
        )}

        {approval.riskLevel && (
          <Box flexDirection="row">
            <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>Risk: </Text>
            <Text
              color={noColor ? undefined : approval.riskLevel === 'high' ? chatterboxAnsi.error : chatterboxAnsi.warning}
              bold
            >
              {approval.riskLevel.toUpperCase()}
            </Text>
          </Box>
        )}

        {(approval.linesAdded !== undefined || approval.linesRemoved !== undefined || approval.changesetId) && (
          <Box flexDirection="row">
            <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>Changeset: </Text>
            {approval.changesetId && (
              <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>
                {approval.changesetId}{' '}
              </Text>
            )}
            {approval.filesCount !== undefined && (
              <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>
                ({approval.filesCount} file{approval.filesCount === 1 ? '' : 's'}){' '}
              </Text>
            )}
            {approval.linesAdded !== undefined && (
              <Text color={noColor ? undefined : chatterboxAnsi.success}>
                +{approval.linesAdded} lines{' '}
              </Text>
            )}
            {approval.linesRemoved !== undefined && (
              <Text color={noColor ? undefined : chatterboxAnsi.error}>
                -{approval.linesRemoved} lines
              </Text>
            )}
          </Box>
        )}

        {approval.description && (
          <Box flexDirection="row">
            <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>Summary: </Text>
            <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>
              {approval.description}
            </Text>
          </Box>
        )}

        {approval.impact && (
          <Box flexDirection="row">
            <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>Impact: </Text>
            <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>
              {approval.impact}
            </Text>
          </Box>
        )}

        {approval.command && (
          <Box flexDirection="row">
            <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>Command: </Text>
            <Text color={noColor ? undefined : chatterboxAnsi.info}>
              {approval.command}
            </Text>
          </Box>
        )}

        {approval.reason && (
          <Box flexDirection="row">
            <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>Reason: </Text>
            <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
              {approval.reason}
            </Text>
          </Box>
        )}
      </Box>

      {/* Diff snippet preview */}
      {approval.diffSnippet && (
        <Box flexDirection="column" marginY={0}>
          <Box flexDirection="column" paddingLeft={0}>
            {approval.diffSnippet.split('\n').slice(0, 8).map((l, idx) => {
              const isAdd = l.startsWith('+') && !l.startsWith('+++');
              const isDel = l.startsWith('-') && !l.startsWith('---');
              const isHunk = l.startsWith('@@') || l.startsWith('---') || l.startsWith('+++');

              const lineCol = isAdd
                ? chatterboxAnsi.success
                : isDel
                  ? chatterboxAnsi.error
                  : isHunk
                    ? chatterboxAnsi.brand
                    : chatterboxAnsi.textSecondary;

              return (
                <Text key={idx} color={noColor ? undefined : lineCol}>
                  {l}
                </Text>
              );
            })}
            {approval.diffSnippet.split('\n').length > 8 && (
              <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
                ... ({approval.diffSnippet.split('\n').length - 8} more lines, press V to view full diff)
              </Text>
            )}
          </Box>
        </Box>
      )}

      <Divider length={62} marginY={0} />

      {/* Action shortcuts */}
      <Box flexDirection="row">
        <Text color={noColor ? undefined : chatterboxAnsi.success} bold>
          A
        </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}> approve · </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.error} bold>
          R
        </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}> reject</Text>
        {approval.diffSnippet && (
          <>
            <Text color={noColor ? undefined : chatterboxAnsi.textMuted}> · </Text>
            <Text color={noColor ? undefined : chatterboxAnsi.brand} bold>
              V
            </Text>
            <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}> full diff</Text>
          </>
        )}
      </Box>
    </Box>
  );
};
