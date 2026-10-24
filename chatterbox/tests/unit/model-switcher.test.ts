import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { ModelSwitcher } from '../../src/tui/components/ModelSwitcher.js';

describe('ModelSwitcher & Menu Navigation', () => {
  const sampleOptions = [
    { provider: 'OpenAI', model: 'gpt-4.1-mini', isCurrent: true },
    { provider: 'OpenAI', model: 'gpt-4.1', isCurrent: false },
    { provider: 'Anthropic', model: 'claude-sonnet-4', isCurrent: false },
  ];

  it('renders active provider and list of available models', () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();

    const { lastFrame } = render(
      React.createElement(ModelSwitcher, {
        currentProvider: 'OpenAI',
        currentModel: 'gpt-4.1-mini',
        options: sampleOptions,
        onSelect,
        onCancel,
      })
    );

    const frame = lastFrame() || '';
    expect(frame).toContain('/model');
    expect(frame).toContain('Active: OpenAI · gpt-4.1-mini');
    expect(frame).toContain('OpenAI · gpt-4.1-mini');
    expect(frame).toContain('← current');
    expect(frame).toContain('Anthropic · claude-sonnet-4');
    expect(frame).toContain('↑/↓ navigate · Enter select · Esc cancel');
  });
});
