import React from 'react';
import { Box, Text } from 'ink';
import { PendingApprovalState } from '../hooks/useAgentFeedEvents.js';

export interface ApprovalPromptProps {
  approval: PendingApprovalState;
}

export const ApprovalPrompt: React.FC<ApprovalPromptProps> = ({ approval }) => {
  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="yellowBright"
      paddingX={1}
    >
      <Box flexDirection="row">
        <Text color="yellowBright" bold>
          ⚠ ACTION APPROVAL REQUIRED [{approval.riskLevel.toUpperCase()} RISK]:{' '}
        </Text>
        <Text color="white" bold>
          {approval.action}
        </Text>
      </Box>
      <Box flexDirection="row" marginTop={0}>
        <Text color="greenBright" bold>
          [A] Approve action
        </Text>
        <Text dimColor>  |  </Text>
        <Text color="redBright" bold>
          [R] Reject action
        </Text>
      </Box>
    </Box>
  );
};
