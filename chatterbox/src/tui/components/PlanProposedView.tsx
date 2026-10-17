import React from 'react';
import { Box, Text } from 'ink';
import { ProposedPlanState } from '../hooks/useAgentFeedEvents.js';
import { AgentAvatar } from './AgentAvatar.js';

export interface PlanProposedViewProps {
  plan: ProposedPlanState;
}

export const PlanProposedView: React.FC<PlanProposedViewProps> = ({ plan }) => {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} marginY={0}>
      <Box flexDirection="row" justifyContent="space-between" marginBottom={0}>
        <Text bold color="cyan">
          PROPOSED PLAN: {plan.title}
        </Text>
        <Text bold color="yellow">
          [AWAITING OPERATOR DECISION]
        </Text>
      </Box>

      <Box marginBottom={0}>
        <Text color="white">{plan.summary}</Text>
      </Box>

      {plan.assumptions.length > 0 && (
        <Box flexDirection="column" marginY={0}>
          <Text bold color="gray">
            Assumptions:
          </Text>
          {plan.assumptions.map((a, i) => (
            <Text key={i} color="gray">
              {'  • '}
              {a}
            </Text>
          ))}
        </Box>
      )}

      {plan.risks.length > 0 && (
        <Box flexDirection="column" marginY={0}>
          <Text bold color="red">
            Identified Risks:
          </Text>
          {plan.risks.map((r, i) => (
            <Text key={i} color="red">
              {'  ⚠ '}
              {r}
            </Text>
          ))}
        </Box>
      )}

      <Box flexDirection="column" marginTop={1}>
        <Text bold color="yellow">
          TASK GRAPH ({plan.tasks.length} tasks)
        </Text>
        {plan.tasks.map((task, idx) => {
          const deps = task.dependsOn.length > 0 ? `(after ${task.dependsOn.join(', ')})` : '(root)';
          const effort = task.estimatedEffort ? `[${task.estimatedEffort.toUpperCase()}]` : '';

          return (
            <Box key={task.id} flexDirection="column" marginY={0}>
              <Box flexDirection="row" justifyContent="space-between">
                <Box flexDirection="row">
                  <Text color="white" bold>
                    {idx + 1}. {task.title.padEnd(30)}{' '}
                  </Text>
                  <AgentAvatar role={task.assignedAgentRole} />
                </Box>
                <Text color="gray">
                  {deps} {effort}
                </Text>
              </Box>
              {task.acceptanceCriteria.length > 0 && (
                <Box paddingLeft={3}>
                  <Text dimColor>
                    ✓ Criteria: {task.acceptanceCriteria.join('; ')}
                  </Text>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      <Box
        flexDirection="row"
        justifyContent="center"
        borderStyle="double"
        borderColor="yellow"
        marginTop={1}
        paddingX={1}
      >
        <Text bold color="yellowBright">
          [A] Approve Plan
        </Text>
        <Text color="white">   |   </Text>
        <Text bold color="redBright">
          [R] Reject Plan
        </Text>
        <Text color="white">   |   </Text>
        <Text bold color="cyanBright">
          [E] Request Revision
        </Text>
      </Box>
    </Box>
  );
};
