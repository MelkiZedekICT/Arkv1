/**
 * Monospace-safe Symbols and Minimalist Isometric Wireframe Tesseract Logo
 * Supports AGENTFEED_NO_LOGO=1
 */

export const symbols = {
  // Status Glyphs
  status: {
    done: '✓',
    active: '▸',
    pending: '○',
    failed: '✗',
    paused: '⏸',
    blocked: '⊘',
    warning: '⚠',
  },

  // Chrome
  divider: '─',
  bullet: '•',
  arrow: '→',
  dot: '·',
  warning: '⚠',

  // Logo Marks
  logo: {
    compactMark: '◆◇',
    fullWireframe: [
      '    ┌───┐   ',
      '   ╱│   │╲  ',
      '  ┌─┼───┼─┐ ',
      '  │ │   │ │ ',
      '  └─┼───┼─┘ ',
      '   ╲│   │╱  ',
      '    └───┘   ',
    ].join('\n'),
    getCompactHeader(version = 'v0.1.0'): string {
      if (process.env.AGENTFEED_NO_LOGO === '1') {
        return `Chatterbox · ${version}`;
      }
      return `◆◇ Chatterbox · ${version}`;
    },
    getFullLogo(): string | null {
      if (process.env.AGENTFEED_NO_LOGO === '1') {
        return null;
      }
      return [
        '    ┌───┐   ',
        '   ╱│   │╲  ',
        '  ┌─┼───┼─┐ ',
        '  │ │   │ │ ',
        '  └─┼───┼─┘ ',
        '   ╲│   │╱  ',
        '    └───┘   ',
      ].join('\n');
    },
  },

  // Standard horizontal rule
  makeDivider(length = 62): string {
    return '─'.repeat(Math.max(1, length));
  },
};
