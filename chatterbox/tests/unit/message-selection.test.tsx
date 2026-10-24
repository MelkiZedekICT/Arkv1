import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { MessageSelector } from '../../src/tui/components/MessageSelector.js';
import { MessageActions } from '../../src/tui/components/MessageActions.js';
import { ChatInput } from '../../src/tui/components/ChatInput.js';
import { AgentSelector } from '../../src/tui/components/AgentSelector.js';
import { FeedItem } from '../../src/tui/hooks/useAgentFeedEvents.js';

describe('Message Selection & Interactive Chat Components', () => {
  const sampleItems: FeedItem[] = [
    {
      id: 'item-1',
      timestamp: '12:00:00',
      type: 'agent_thought',
      actorType: 'agent',
      actorId: 'explorer',
      role: 'explorer',
      content: 'Found Express routes and existing Zod patterns.',
    },
    {
      id: 'item-2',
      timestamp: '12:00:01',
      type: 'agent_proposal',
      actorType: 'agent',
      actorId: 'coder',
      role: 'coder',
      content: 'Proposed create_file: src/validations/user.schema.ts',
    },
  ];

  it('renders messages with selection indicators when isSelecting is active', () => {
    const { lastFrame } = render(
      React.createElement(MessageSelector, {
        items: sampleItems,
        selectedIndex: 1,
        isSelecting: true,
      })
    );

    const frame = lastFrame() || '';
    expect(frame).toContain('[EXPLORER]');
    expect(frame).toContain('[CODER]');
    expect(frame).toContain('▸ [CODER]');
    expect(frame).toContain('Proposed create_file: src/validations/user.schema.ts');
  });

  it('renders messages without focus pointer when not selecting', () => {
    const { lastFrame } = render(
      React.createElement(MessageSelector, {
        items: sampleItems,
        selectedIndex: -1,
        isSelecting: false,
      })
    );

    const frame = lastFrame() || '';
    expect(frame).not.toContain('▸');
    expect(frame).toContain('[EXPLORER]');
    expect(frame).toContain('[CODER]');
  });

  it('renders MessageActions menu for a selected message', () => {
    const onAction = vi.fn();
    const onClose = vi.fn();
    const { lastFrame } = render(
      React.createElement(MessageActions, {
        item: sampleItems[1]!,
        onAction,
        onClose,
      })
    );

    const frame = lastFrame() || '';
    expect(frame).toContain('Message from CODER:');
    expect(frame).toContain('What would you like to do?');
    expect(frame).toContain('Approve');
    expect(frame).toContain('Reject');
    expect(frame).toContain('Ask a question');
    expect(frame).toContain('Request revision');
    expect(frame).toContain('Redirect to another agent');
    expect(frame).toContain('View diff');
    expect(frame).toContain('Copy message');
  });

  it('renders ChatInput with active target agent prompt when @mentioned', () => {
    const { lastFrame } = render(
      React.createElement(ChatInput, {
        targetAgent: 'coder',
        onSubmit: vi.fn(),
        onMentionRequest: vi.fn(),
        onSlashCommand: vi.fn(),
      })
    );

    const frame = lastFrame() || '';
    expect(frame).toContain('@coder');
  });

  it('renders AgentSelector popup with all specialist agent roles', () => {
    const { lastFrame } = render(
      React.createElement(AgentSelector, {
        onSelect: vi.fn(),
        onCancel: vi.fn(),
      })
    );

    const frame = lastFrame() || '';
    expect(frame).toContain('Select agent:');
    expect(frame).toContain('Explorer');
    expect(frame).toContain('Planner');
    expect(frame).toContain('Coder');
    expect(frame).toContain('Tester');
    expect(frame).toContain('Reviewer');
  });
});
