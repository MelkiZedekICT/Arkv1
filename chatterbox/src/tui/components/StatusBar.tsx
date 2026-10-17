import React from 'react';
import { Box, Text } from 'ink';

export interface StatusBarProps {
  isPaused: boolean;
  isCompleted: boolean;
  hasArtifact: boolean;
  isViewingArtifact: boolean;
  awaitingApproval: boolean;
  awaitingPlanDecision?: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  isPaused,
  isCompleted,
  hasArtifact,
  isViewingArtifact,
  awaitingApproval,
  awaitingPlanDecision,
}) => {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
    >
      <Box flexDirection="row" justifyContent="space-between">
        <Box flexDirection="row">
          {awaitingPlanDecision && (
            <>
              <Text color="yellowBright" bold>
                [A]{' '}
              </Text>
              <Text>Approve Plan  </Text>
              <Text color="redBright" bold>
                [R]{' '}
              </Text>
              <Text>Reject Plan  </Text>
              <Text color="cyanBright" bold>
                [E]{' '}
              </Text>
              <Text>Revise  </Text>
            </>
          )}
          {awaitingApproval && !awaitingPlanDecision && (
            <>
              <Text color="greenBright" bold>
                [A]{' '}
              </Text>
              <Text>Approve  </Text>
              <Text color="redBright" bold>
                [R]{' '}
              </Text>
              <Text>Reject  </Text>
            </>
          )}
          <Text color="yellow" bold>
            [P]{' '}
          </Text>
          <Text>Pause  </Text>
          <Text color="green" bold>
            [S]{' '}
          </Text>
          <Text>Resume  </Text>
          <Text color={hasArtifact ? 'magenta' : 'gray'} bold>
            [V]{' '}
          </Text>
          <Text color={hasArtifact ? 'white' : 'gray'}>
            {isViewingArtifact ? 'Close artifact  ' : 'View artifact  '}
          </Text>
          <Text color="red" bold>
            [Q]{' '}
          </Text>
          <Text>Quit</Text>
        </Box>

        <Box>
          {isPaused && (
            <Text color="yellow" bold>
              [PAUSED]
            </Text>
          )}
          {isCompleted && (
            <Text color="green" bold>
              [DONE]
            </Text>
          )}
        </Box>
      </Box>
    </Box>
  );
};
