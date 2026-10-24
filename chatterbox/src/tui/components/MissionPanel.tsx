import React from 'react';
import { Box, Text } from 'ink';
import { Divider } from './Divider.js';
import { symbols } from '../design/symbols.js';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';
import { MissionRecord, MissionStatus } from '../../core/ledger/types.js';

export interface MissionPanelProps {
  mission: MissionRecord;
  currentPhase?: string;
  activeAgent?: string;
  filesChanged?: string[];
  testsPassed?: number;
  testsTotal?: number;
}

export const MissionPanel: React.FC<MissionPanelProps> = ({
  mission,
  currentPhase = 'executing',
  activeAgent,
  filesChanged = [],
  testsPassed = 0,
  testsTotal = 0,
}) => {
  const noColor = isNoColor();

  const getStatusColor = (status: MissionStatus) => {
    switch (status) {
      case 'completed':
        return chatterboxAnsi.success;
      case 'failed':
        return chatterboxAnsi.error;
      case 'awaiting_approval':
        return chatterboxAnsi.warning;
      case 'running':
      default:
        return chatterboxAnsi.brand;
    }
  };

  const statusColor = noColor ? undefined : getStatusColor(mission.status);
  const recentEvents = mission.events.slice(-5);

  return (
    <Box flexDirection="column" marginY={1}>
      {/* Header Bar */}
      <Box flexDirection="row">
        <Text color={noColor ? undefined : chatterboxAnsi.brand} bold>
          {symbols.logo.compactMark} Chatterbox
        </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}> · Mission </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.info} bold>
          {mission.display_id}
        </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}> · </Text>
        <Text color={statusColor} bold>
          {mission.status}
        </Text>
      </Box>

      <Divider length={72} marginY={0} />

      {/* Goal & Provider Row */}
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary} bold>
            GOAL{'     '}
          </Text>
          <Text color={noColor ? undefined : chatterboxAnsi.textPrimary} bold>
            {mission.goal.length > 60 ? `${mission.goal.slice(0, 57)}...` : mission.goal}
          </Text>
        </Box>
        <Box flexDirection="row">
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>
            PROVIDER{' '}
          </Text>
          <Text color={noColor ? undefined : chatterboxAnsi.info}>
            {mission.provider.name}
          </Text>
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}> · </Text>
          <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>
            {mission.model}
          </Text>
        </Box>
        <Box flexDirection="row">
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>
            AGENTS{'   '}
          </Text>
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>
            {mission.agents.map((a) => a.role).join(' · ')}
          </Text>
        </Box>
        <Box flexDirection="row">
          <Text color={noColor ? undefined : chatterboxAnsi.textSecondary}>
            PHASE{'    '}
          </Text>
          <Text color={noColor ? undefined : chatterboxAnsi.info}>
            {currentPhase}
          </Text>
          {activeAgent && (
            <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
              {' '}(active: {activeAgent})
            </Text>
          )}
        </Box>
      </Box>

      <Divider length={72} marginY={0} />

      {/* Recent Activity Timeline */}
      <Box flexDirection="column">
        <Text color={noColor ? undefined : chatterboxAnsi.textSecondary} bold>
          TIMELINE
        </Text>
        {recentEvents.map((evt, idx) => {
          const time = evt.timestamp ? evt.timestamp.slice(11, 16) : '00:00';
          const isHuman = evt.actor_type === 'human';
          const actorColor = isHuman
            ? chatterboxAnsi.warning
            : evt.actor_type === 'system'
            ? chatterboxAnsi.textMuted
            : chatterboxAnsi.brand;

          return (
            <Box key={idx} flexDirection="row">
              <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
                {'  '}{time}{' '}
              </Text>
              <Text color={noColor ? undefined : actorColor} bold>
                {evt.actor.padEnd(14)}{' '}
              </Text>
              <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>
                {evt.summary.length > 46 ? `${evt.summary.slice(0, 43)}...` : evt.summary}
              </Text>
            </Box>
          );
        })}
      </Box>

      <Divider length={72} marginY={0} />

      {/* Outcome / Result Summary */}
      <Box flexDirection="row">
        <Text color={noColor ? undefined : chatterboxAnsi.textSecondary} bold>
          RESULT{'   '}
        </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textPrimary}>
          {filesChanged.length} file{filesChanged.length === 1 ? '' : 's'} changed
          {testsTotal > 0 && ` · ${testsPassed}/${testsTotal} tests passed`}
          {' · '}{mission.status}
        </Text>
      </Box>
    </Box>
  );
};
