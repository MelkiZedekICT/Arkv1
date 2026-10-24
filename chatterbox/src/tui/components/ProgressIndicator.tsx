import React from 'react';
import { Box, Text } from 'ink';
import { Spinner } from './Spinner.js';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';
import { symbols } from '../design/symbols.js';

export type ProgressPhase =
  | 'task_created'
  | 'workspace_resolving'
  | 'provider_checking'
  | 'explorer_starting'
  | 'ready';

interface ProgressStep {
  phase: ProgressPhase;
  label: string;
}

const PROGRESS_STEPS: ProgressStep[] = [
  { phase: 'task_created', label: 'Task created' },
  { phase: 'workspace_resolving', label: 'Resolving workspace' },
  { phase: 'provider_checking', label: 'Checking provider/model' },
  { phase: 'explorer_starting', label: 'Starting Explorer' },
  { phase: 'ready', label: 'Ready' },
];

export interface ProgressIndicatorProps {
  currentPhase: ProgressPhase;
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({ currentPhase }) => {
  const noColor = isNoColor();
  const currentIdx = PROGRESS_STEPS.findIndex((s) => s.phase === currentPhase);

  return (
    <Box flexDirection="column" marginY={0}>
      {PROGRESS_STEPS.map((step, idx) => {
        const isDone = idx < currentIdx;
        const isActive = idx === currentIdx;
        const isPending = idx > currentIdx;

        let icon: React.ReactNode;
        let color: string | undefined;

        if (isDone) {
          icon = <Text color={noColor ? undefined : chatterboxAnsi.success}>{symbols.status.done} </Text>;
          color = chatterboxAnsi.textSecondary;
        } else if (isActive) {
          icon = <Spinner />;
          color = chatterboxAnsi.textPrimary;
        } else {
          icon = <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>{symbols.status.pending} </Text>;
          color = chatterboxAnsi.textMuted;
        }

        if (isPending && !isActive) {
          return null; // Only show completed and active steps
        }

        return (
          <Box key={step.phase} flexDirection="row">
            {icon}
            <Text color={noColor ? undefined : color} bold={isActive}>
              {step.label}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};
