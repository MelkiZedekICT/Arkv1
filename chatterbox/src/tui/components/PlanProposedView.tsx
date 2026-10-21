import React from 'react';
import { Box, Text } from 'ink';
import { ProposedPlanState } from '../hooks/useAgentFeedEvents.js';
import { Divider } from './Divider.js';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';

export interface PlanProposedViewProps {
  plan: ProposedPlanState;
}

export const PlanProposedView: React.FC<PlanProposedViewProps> = ({ plan }) => {
  const noColor = isNoColor();

  return (
    <Box flexDirection="column" marginY={0}>
      <Divider length={62} marginY={0} />

      <Box flexDirection="row" justifyContent="space-between" marginBottom={0}>
        <Text color={noColor ? undefined : chatterboxAnsi.brand} bold>
          PROPOSED PLAN: {plan.title}
        </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.warning} bold>
          [AWAITING DECISION]
        </Text>
      </Box>

      <Box marginY={0}>
        <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>{plan.summary}</Text>
      </Box>

      {plan.assumptions.length > 0 && (
        <Box flexDirection="column" marginY={0}>
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary} bold>Assumptions:</Text>
          {plan.assumptions.map((a, i) => (
            <Text key={i} color={noColor ? undefined : chatterboxAnsi.textMuted}>
              {'  • '}{a}
            </Text>
          ))}
        </Box>
      )}

      {plan.risks.length > 0 && (
        <Box flexDirection="column" marginY={0}>
          <Text color={noColor ? undefined : chatterboxAnsi.error} bold>Identified Risks:</Text>
          {plan.risks.map((r, i) => (
            <Text key={i} color={noColor ? undefined : chatterboxAnsi.error}>
              {'  • '}{r}
            </Text>
          ))}
        </Box>
      )}

      <Box flexDirection="column" marginTop={1}>
        <Text color={noColor ? undefined : chatterboxAnsi.brand} bold>
          TASK GRAPH ({plan.tasks.length} stages)
        </Text>
        {plan.tasks.map((task, idx) => {
          const deps = task.dependsOn.length > 0 ? `(after ${task.dependsOn.join(', ')})` : '(root)';

          return (
            <Box key={task.id} flexDirection="column" marginY={0}>
              <Box flexDirection="row" justifyContent="space-between">
                <Box flexDirection="row">
                  <Text color={noColor ? undefined : chatterboxAnsi.textPrimary} bold>
                    {idx + 1}. {task.title.padEnd(28)}{' '}
                  </Text>
                  <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>
                    [{task.assignedAgentRole.toUpperCase()}]
                  </Text>
                </Box>
                <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>{deps}</Text>
              </Box>
              {task.acceptanceCriteria.length > 0 && (
                <Box paddingLeft={3}>
                  <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
                    ✓ Criteria: {task.acceptanceCriteria.join('; ')}
                  </Text>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      <Box flexDirection="row" marginTop={1}>
        <Text color={noColor ? undefined : chatterboxAnsi.success} bold>A</Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}> approve · </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.error} bold>R</Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}> reject · </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.warning} bold>E</Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}> edit plan · </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textPrimary} bold>M</Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}> request revision</Text>
      </Box>

      <Divider length={62} marginY={0} />
    </Box>
  );
};
