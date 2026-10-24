import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { WelcomeScreen } from '../../src/tui/components/WelcomeScreen.js';

describe('WelcomeScreen TUI Component', () => {
  it('renders unconfigured provider status and highlights Try the demo', () => {
    const onSelect = vi.fn();
    const { lastFrame } = render(
      React.createElement(WelcomeScreen, {
        version: 'v0.2.0',
        providerConfigured: false,
        onSelect,
      })
    );

    const frame = lastFrame() || '';
    expect(frame).toContain('Chatterbox');
    expect(frame).toContain('Provider:  ✗ Not configured');
    expect(frame).toContain('Model:     – Not selected');
    expect(frame).toContain('▸ Try the demo');
    expect(frame).toContain('works offline, no API key needed');
  });

  it('renders configured provider status and highlights Start a task', () => {
    const onSelect = vi.fn();
    const { lastFrame } = render(
      React.createElement(WelcomeScreen, {
        version: 'v0.2.0',
        providerConfigured: true,
        providerName: 'OpenAI',
        modelName: 'gpt-4.1-mini',
        onSelect,
      })
    );

    const frame = lastFrame() || '';
    expect(frame).toContain('Provider:  ✓ OpenAI');
    expect(frame).toContain('Model:     ✓ gpt-4.1-mini');
    expect(frame).toContain('▸ Start a task');
  });

  it('contains all key menu options and navigation instructions', () => {
    const onSelect = vi.fn();
    const { lastFrame } = render(
      React.createElement(WelcomeScreen, {
        version: 'v0.2.0',
        providerConfigured: false,
        onSelect,
      })
    );

    const frame = lastFrame() || '';
    expect(frame).toContain('Try the demo');
    expect(frame).toContain('Set up AI provider');
    expect(frame).toContain('Start a task');
    expect(frame).toContain('View recent tasks');
    expect(frame).toContain('Open settings');
    expect(frame).toContain('Exit');
    expect(frame).toContain('↑/↓ navigate · Enter select');
  });
});
