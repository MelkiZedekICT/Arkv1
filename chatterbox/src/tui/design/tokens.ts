/**
 * Chatterbox Design Tokens
 * Direction A: Minimalist Isometric Wireframe Tesseract
 * Strict palette: Warm amber brand accent, neutral grays, disciplined semantic states.
 * Respects NO_COLOR=1 across all terminal environments.
 */

export function isNoColor(): boolean {
  return Boolean(
    typeof process !== 'undefined' &&
    process.env &&
    process.env.NO_COLOR !== undefined &&
    process.env.NO_COLOR !== ''
  );
}

// Brand Accent & Semantic Tokens
export const chatterboxTheme = {
  // Brand Accent: One restrained warm amber/copper
  brand: '#F59E0B',
  brandDim: '#B45309',

  // Neutral Scale
  textPrimary: '#F3F4F6',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',
  surfaceBorder: '#374151',
  surfaceSubtle: '#1F2937',

  // Semantic Status (Strictly functional)
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#60A5FA',
  running: '#F59E0B',
} as const;

export const chatterboxAnsi = {
  brand: 'yellow' as const,
  brandDim: 'yellow' as const,
  textPrimary: 'white' as const,
  textSecondary: 'gray' as const,
  textMuted: 'gray' as const,
  surfaceBorder: 'gray' as const,
  success: 'green' as const,
  warning: 'yellow' as const,
  error: 'red' as const,
  info: 'blue' as const,
  running: 'yellow' as const,
} as const;

// Backward-compatible color tokens
export const colors = {
  brand: {
    primary: '#F59E0B',
    hover: '#D97706',
    subtle: '#78350F',
    ansi: 'yellow' as const,
  },
  fg: {
    primary: '#F9FAFB',
    secondary: '#9CA3AF',
    muted: '#6B7280',
    subtle: '#4B5563',
    ansiPrimary: 'white' as const,
    ansiSecondary: 'gray' as const,
  },
  status: {
    success: '#10B981',
    error: '#EF4444',
    warning: '#F59E0B',
    info: '#60A5FA',
    ansiSuccess: 'green' as const,
    ansiError: 'red' as const,
    ansiWarning: 'yellow' as const,
    ansiInfo: 'cyan' as const,
  },
  divider: {
    color: '#374151',
    ansi: 'gray' as const,
  },
} as const;

export const dimensions = {
  minWidth: 80,
  minHeight: 24,
  preferredWidth: 120,
  preferredHeight: 35,
  dividerLength: 62,
} as const;
