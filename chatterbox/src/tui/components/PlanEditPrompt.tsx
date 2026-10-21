import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { ProposedPlanState, ProposedPlanTaskState } from '../hooks/useAgentFeedEvents.js';
import { Divider } from './Divider.js';
import { ShortcutBar } from './ShortcutBar.js';
import { symbols } from '../design/symbols.js';
import { chatterboxAnsi, isNoColor } from '../design/tokens.js';

export interface PlanEditPromptProps {
  plan: ProposedPlanState;
  onApproveEditedPlan: (editedTasks: ProposedPlanTaskState[]) => void;
  onCancel: () => void;
}

export const PlanEditPrompt: React.FC<PlanEditPromptProps> = ({
  plan,
  onApproveEditedPlan,
  onCancel,
}) => {
  const [tasks, setTasks] = useState<ProposedPlanTaskState[]>([...plan.tasks]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(tasks.length - 1, prev + 1));
      return;
    }

    const char = input.toLowerCase();

    // Delete selected node
    if (char === 'd' && tasks.length > 1) {
      const removed = tasks[selectedIndex];
      const updated = tasks
        .filter((_, idx) => idx !== selectedIndex)
        .map((t) => ({
          ...t,
          dependsOn: t.dependsOn.filter((dep) => dep !== removed.id),
        }));
      setTasks(updated);
      setSelectedIndex((prev) => Math.min(updated.length - 1, prev));
      setStatusMessage(`Deleted node: "${removed.title}"`);
      return;
    }

    // Cycle agent role
    if (char === 'r' && tasks.length > 0) {
      const roles = ['researcher', 'analyst', 'writer', 'reviewer'];
      const currentRole = tasks[selectedIndex].assignedAgentRole;
      const nextRole = roles[(roles.indexOf(currentRole) + 1) % roles.length];
      const updated = [...tasks];
      updated[selectedIndex] = {
        ...updated[selectedIndex],
        assignedAgentRole: nextRole,
      };
      setTasks(updated);
      setStatusMessage(`Changed role for "${updated[selectedIndex].title}" to ${nextRole.toUpperCase()}`);
      return;
    }

    // Add note to selected node
    if (char === 'n' && tasks.length > 0) {
      const updated = [...tasks];
      const currentDesc = updated[selectedIndex].description;
      updated[selectedIndex] = {
        ...updated[selectedIndex],
        description: currentDesc ? `${currentDesc} [User note: Prioritize open source]` : '[User note: Prioritize open source]',
      };
      setTasks(updated);
      setStatusMessage(`Added note to "${updated[selectedIndex].title}"`);
      return;
    }

    // Approve edited plan
    if (char === 'a') {
      onApproveEditedPlan(tasks);
      return;
    }
  });

  const noColor = isNoColor();

  return (
    <Box flexDirection="column" marginY={1}>
      <Divider />
      <Box flexDirection="row" justifyContent="space-between" marginY={0}>
        <Text color={noColor ? undefined : chatterboxAnsi.brand} bold>
          EDIT PROPOSED PLAN
        </Text>
        <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
          {tasks.length} tasks
        </Text>
      </Box>
      <Text color={noColor ? undefined : chatterboxAnsi.textMuted}>
        Use ↑/↓ to select node · d delete · r cycle role · n add note
      </Text>

      <Box flexDirection="column" marginY={1} paddingLeft={1}>
        {tasks.map((t, idx) => {
          const isSelected = idx === selectedIndex;
          const bullet = isSelected ? symbols.status.active : ' ';
          return (
            <Box key={t.id} flexDirection="row">
              <Text color={noColor ? undefined : isSelected ? chatterboxAnsi.brand : chatterboxAnsi.textMuted} bold={isSelected}>
                {bullet} [{idx + 1}] [{t.assignedAgentRole.toUpperCase()}] {t.title}
              </Text>
              {t.description && (
                <Text color={noColor ? undefined : chatterboxAnsi.textMuted}> — {t.description.slice(0, 36)}</Text>
              )}
            </Box>
          );
        })}
      </Box>

      {statusMessage && (
        <Box marginBottom={1} paddingLeft={1}>
          <Text color={noColor ? undefined : chatterboxAnsi.success}>
            {symbols.status.done} {statusMessage}
          </Text>
        </Box>
      )}

      <Divider />
      <ShortcutBar
        shortcuts={[
          { key: 'd', label: 'delete node' },
          { key: 'r', label: 'cycle role' },
          { key: 'n', label: 'add note' },
          { key: 'a', label: 'approve' },
          { key: 'esc', label: 'cancel' },
        ]}
      />
    </Box>
  );
};
