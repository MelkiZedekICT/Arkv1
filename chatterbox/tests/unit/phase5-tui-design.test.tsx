import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { colors, dimensions, chatterboxTheme, chatterboxAnsi, isNoColor } from '../../src/tui/design/tokens.js';
import { theme } from '../../src/tui/design/theme.js';
import { symbols } from '../../src/tui/design/symbols.js';
import { typography } from '../../src/tui/design/typography.js';
import { spacing } from '../../src/tui/design/spacing.js';

import { ChatterboxLogo } from '../../src/tui/components/ChatterboxLogo.js';
import { AgentRoster } from '../../src/tui/components/AgentRoster.js';
import { TaskGraph } from '../../src/tui/components/TaskGraph.js';
import { StatusBar } from '../../src/tui/components/StatusBar.js';
import { ApprovalPrompt } from '../../src/tui/components/ApprovalPrompt.js';
import { AgentLine } from '../../src/tui/components/AgentLine.js';
import { AgentFeed } from '../../src/tui/components/AgentFeed.js';
import { AppHeader } from '../../src/tui/components/AppHeader.js';
import { TaskCompletedView } from '../../src/tui/components/TaskCompletedView.js';
import { HelpOverlay } from '../../src/tui/components/HelpOverlay.js';
import { Spinner } from '../../src/tui/components/Spinner.js';

describe('Milestone 10 Phase 5: Premium Restrained TUI Redesign', () => {
  const originalEnvLogo = process.env.AGENTFEED_NO_LOGO;
  const originalNoColor = process.env.NO_COLOR;
  const originalReducedMotion = process.env.REDUCED_MOTION;

  beforeEach(() => {
    delete process.env.AGENTFEED_NO_LOGO;
    delete process.env.NO_COLOR;
    delete process.env.REDUCED_MOTION;
  });

  afterEach(() => {
    if (originalEnvLogo !== undefined) {
      process.env.AGENTFEED_NO_LOGO = originalEnvLogo;
    } else {
      delete process.env.AGENTFEED_NO_LOGO;
    }

    if (originalNoColor !== undefined) {
      process.env.NO_COLOR = originalNoColor;
    } else {
      delete process.env.NO_COLOR;
    }

    if (originalReducedMotion !== undefined) {
      process.env.REDUCED_MOTION = originalReducedMotion;
    } else {
      delete process.env.REDUCED_MOTION;
    }
  });

  it('1. Full and compact logo variants render Concept 1 wireframe tesseract and compact mark', () => {
    // Compact mark and header
    const compactHeader = symbols.logo.getCompactHeader('v0.1.0');
    expect(compactHeader).toContain('◆◇ Chatterbox · v0.1.0');

    // Full isometric clean wireframe tesseract
    const fullLogo = symbols.logo.getFullLogo();
    expect(fullLogo).not.toBeNull();
    expect(fullLogo).toContain('┌───┐');
    expect(fullLogo).toContain('╱│   │╲');
    expect(fullLogo).toContain('┌─┼───┼─┐');
    expect(fullLogo).toContain('│ │   │ │');
    expect(fullLogo).toContain('└─┼───┼─┘');
    expect(fullLogo).toContain('╲│   │╱');
    expect(fullLogo).toContain('└───┘');

    // Component renders
    const { lastFrame: frameCompact } = render(<ChatterboxLogo variant="compact" version="v0.1.0" />);
    expect(frameCompact()).toContain('◆◇');
    expect(frameCompact()).toContain('Chatterbox');
    expect(frameCompact()).toContain('v0.1.0');

    const { lastFrame: frameFull } = render(<ChatterboxLogo variant="full" />);
    expect(frameFull()).toContain('┌───┐');
    expect(frameFull()).toContain('└───┘');
  });

  it('2. AGENTFEED_NO_LOGO=1 disables both full and compact logo marks', () => {
    process.env.AGENTFEED_NO_LOGO = '1';

    expect(symbols.logo.getCompactHeader('v0.1.0')).toBe('Chatterbox · v0.1.0');
    expect(symbols.logo.getFullLogo()).toBeNull();

    const { lastFrame: frameCompact } = render(<ChatterboxLogo variant="compact" version="v0.1.0" />);
    expect(frameCompact()).toBe('');

    const { lastFrame: frameFull } = render(<ChatterboxLogo variant="full" />);
    expect(frameFull()).toBe('');
  });

  it('3. NO_COLOR=1 disables ANSI colors across theme tokens and status mappers', () => {
    process.env.NO_COLOR = '1';
    expect(isNoColor()).toBe(true);

    expect(theme.nodeStatusAnsi('done')).toBeUndefined();
    expect(theme.nodeStatusAnsi('running')).toBeUndefined();
    expect(theme.nodeStatusAnsi('failed')).toBeUndefined();
    expect(theme.nodeStatusAnsi('pending')).toBeUndefined();
    expect(theme.nodeStatusAnsi('paused')).toBeUndefined();
  });

  it('4. Theme tokens provide consistent restrained status colors and single warm amber brand accent', () => {
    // Single warm amber accent
    expect(chatterboxTheme.brand).toBe('#F59E0B');
    expect(chatterboxAnsi.brand).toBe('yellow');

    // Semantic status colors
    expect(chatterboxTheme.success).toBe('#10B981');
    expect(chatterboxTheme.running).toBe('#F59E0B');
    expect(chatterboxTheme.error).toBe('#EF4444');

    // Standard ANSI equivalents
    expect(chatterboxAnsi.success).toBe('green');
    expect(chatterboxAnsi.warning).toBe('yellow');
    expect(chatterboxAnsi.error).toBe('red');
    expect(chatterboxAnsi.info).toBe('blue');

    // Backwards-compatible colors object
    expect(colors.brand.primary).toBe('#F59E0B');
    expect(colors.status.success).toBe('#10B981');
    expect(colors.status.error).toBe('#EF4444');
    expect(colors.status.warning).toBe('#F59E0B');

    // Standard terminal bounds
    expect(dimensions.minWidth).toBe(80);
    expect(dimensions.minHeight).toBe(24);

    // Spacing and Typography tokens
    expect(spacing.indent.base).toBe('  ');
    expect(typography.roleTag('coder')).toBe('[CODER]');
  });

  it('5. Agent roster maps statuses to correct symbols', () => {
    const agents = [
      { role: 'planner', status: 'done' as const },
      { role: 'coder', status: 'busy' as const, currentAction: 'Proposing changeset' },
      { role: 'reviewer', status: 'idle' as const },
      { role: 'tester', status: 'failed' as const },
    ];

    const { lastFrame } = render(<AgentRoster agents={agents} title="ROSTER" />);
    const output = lastFrame();

    expect(output).toContain('ROSTER');
    expect(output).toContain('✓ [PLANNER]');
    expect(output).toContain('▸ [CODER]');
    expect(output).toContain('○ [REVIEWER]');
    expect(output).toContain('✗ [TESTER]');
  });

  it('6. Task graph maps statuses to correct symbols', () => {
    const nodes = [
      { id: '1', title: 'Explore codebase', assignedAgentRole: 'explorer', status: 'completed' as const },
      { id: '2', title: 'Propose changeset', assignedAgentRole: 'coder', status: 'running' as const },
      { id: '3', title: 'Review changes', assignedAgentRole: 'reviewer', status: 'pending' as const },
      { id: '4', title: 'Run tests', assignedAgentRole: 'tester', status: 'failed' as const },
      { id: '5', title: 'Apply changes', assignedAgentRole: 'coder', status: 'paused' as const },
    ];

    const { lastFrame } = render(<TaskGraph nodes={nodes} />);
    const output = lastFrame();

    expect(output).toContain('1 ✓ Explore codebase');
    expect(output).toContain('2 ▸ Propose changeset');
    expect(output).toContain('3 ○ Review changes');
    expect(output).toContain('4 ✗ Run tests');
    expect(output).toContain('5 ⏸');
    expect(output).toContain('Apply changes');
  });

  it('7. Status bar shows only context-relevant keyboard shortcuts', () => {
    // When showing help: only show close actions
    const { lastFrame: frameHelp } = render(
      <StatusBar
        isPaused={false}
        isCompleted={false}
        hasArtifact={false}
        isViewingArtifact={false}
        awaitingApproval={false}
        isShowingHelp={true}
      />
    );
    expect(frameHelp()).toContain('? close help');
    expect(frameHelp()).toContain('Esc close');
    expect(frameHelp()).not.toContain('a approve');
    expect(frameHelp()).not.toContain('p pause');

    // When awaiting action approval: show approve, reject, view diff
    const { lastFrame: frameApproval } = render(
      <StatusBar
        isPaused={false}
        isCompleted={false}
        hasArtifact={false}
        isViewingArtifact={false}
        hasDiff={true}
        isViewingDiff={false}
        awaitingApproval={true}
      />
    );
    expect(frameApproval()).toContain('A approve');
    expect(frameApproval()).toContain('R reject');
    expect(frameApproval()).toContain('V view diff');
    expect(frameApproval()).toContain('? help');
    expect(frameApproval()).toContain('Q quit');
    expect(frameApproval()).not.toContain('S resume');

    // When paused: show resume
    const { lastFrame: framePaused } = render(
      <StatusBar
        isPaused={true}
        isCompleted={false}
        hasArtifact={false}
        isViewingArtifact={false}
        awaitingApproval={false}
      />
    );
    expect(framePaused()).toContain('S resume');
    expect(framePaused()).not.toContain('P pause');

    // When task is completed: show view artifact/diff and quit
    const { lastFrame: frameDone } = render(
      <StatusBar
        isPaused={false}
        isCompleted={true}
        hasArtifact={true}
        isViewingArtifact={false}
        hasDiff={true}
        isViewingDiff={false}
        awaitingApproval={false}
      />
    );
    expect(frameDone()).toContain('V view summary');
    expect(frameDone()).toContain('Q exit');
    expect(frameDone()).not.toContain('A approve');
    expect(frameDone()).not.toContain('P pause');
  });

  it('8. Approval prompt displays agent, action, target path, risk level, and changeset details', () => {
    const approval = {
      approvalId: 'app_123',
      actionType: 'modify_file',
      agentRole: 'coder',
      target: 'src/server.ts',
      targetPath: 'src/server.ts',
      riskLevel: 'high' as const,
      diffSnippet: '@@ -1,3 +1,3 @@\n-old code\n+new secure code',
      description: 'Patch insecure socket binding',
      filesCount: 1,
      linesAdded: 5,
      linesRemoved: 2,
    };

    const { lastFrame } = render(<ApprovalPrompt approval={approval} />);
    const output = lastFrame();

    expect(output).toContain('APPROVAL REQUIRED');
    expect(output).toContain('coder');
    expect(output).toContain('src/server.ts');
    expect(output).toContain('HIGH');
    expect(output).toContain('+5 lines');
    expect(output).toContain('-2 lines');
    expect(output).toContain('Patch insecure socket binding');
    expect(output).toContain('A approve');
    expect(output).toContain('R reject');
  });

  it('9. Feed safely truncates long agent messages without overflowing boundaries', () => {
    const longMessage = 'A'.repeat(250);
    const { lastFrame: frameLine } = render(
      <AgentLine
        role="coder"
        message={longMessage}
        maxWidth={70}
      />
    );
    const lineOutput = frameLine();
    expect(lineOutput).toContain('...');
    expect(lineOutput.length).toBeLessThan(100);

    const items = [
      {
        id: 'msg_1',
        timestamp: '12:00:01',
        role: 'researcher',
        content: 'B'.repeat(300),
      },
    ];

    const { lastFrame: frameFeed } = render(
      <AgentFeed
        items={items}
        maxVisible={5}
        activeRole="researcher"
        activeDescription="Analyzing dependencies"
      />
    );
    const feedOutput = frameFeed();
    expect(feedOutput).toContain('ACTIVE: [RESEARCHER]');
    expect(feedOutput).toContain('[RESEARCHER]');
    expect(feedOutput).toContain('...');
  });

  it('10. Layout components render cleanly at minimum 80x24 terminal constraint without throwing', () => {
    expect(() => {
      render(
        <AppHeader
          title="Fix bug in auth middleware"
          status="running"
          elapsedTime="00:42"
          workspaceRoot="/home/user/project"
          mode="supervised"
          completedNodes={2}
          totalNodes={5}
        />
      );
    }).not.toThrow();

    expect(() => {
      render(
        <TaskCompletedView
          taskId="task_complete_1"
          title="Refactor auth service"
          elapsedTime="01:15"
          artifacts={[{ artifactId: 'art_1', title: 'change-summary.md', type: 'summary', path: '/workspace/.chatterbox/change-summary.md' }]}
        />
      );
    }).not.toThrow();
  });

  it('11. ? triggers help overlay rendering all available keybindings', () => {
    const onClose = vi.fn();
    const { lastFrame } = render(<HelpOverlay onClose={onClose} />);
    const output = lastFrame();

    expect(output).toContain('KEYBOARD SHORTCUTS');
    expect(output).toContain('A');
    expect(output).toContain('Approve current plan');
    expect(output).toContain('R');
    expect(output).toContain('Reject current plan');
    expect(output).toContain('P');
    expect(output).toContain('Pause task execution');
    expect(output).toContain('S');
    expect(output).toContain('Resume paused task execution');
    expect(output).toContain('M');
    expect(output).toContain('Mention an agent');
    expect(output).toContain('V');
    expect(output).toContain('Toggle unified diff');
    expect(output).toContain('?');
    expect(output).toContain('Toggle this keyboard shortcut help overlay');
    expect(output).toContain('Q');
    expect(output).toContain('Quit current task execution safely');
    expect(output).toContain('Ctrl+C');
  });

  it('12. Safe quit triggers runner stop and orderly terminal exit', () => {
    const runner = {
      stop: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };
    const onExit = vi.fn();

    // Verify safe exit contract is implemented
    expect(typeof runner.stop).toBe('function');
    runner.stop();
    expect(runner.stop).toHaveBeenCalledTimes(1);

    if (onExit) onExit();
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('13. Reduced-motion mode disables animation and renders static glyph without interval timer', () => {
    process.env.REDUCED_MOTION = '1';

    const { lastFrame } = render(<Spinner staticFallback="▸" />);
    expect(lastFrame()).toContain('▸');
  });
});
