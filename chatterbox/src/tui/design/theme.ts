import { colors, dimensions, chatterboxTheme, chatterboxAnsi, isNoColor } from './tokens.js';

export interface Theme {
  colors: typeof colors;
  dimensions: typeof dimensions;
  tokens: typeof chatterboxTheme;
  ansi: typeof chatterboxAnsi;
  isNoColor: () => boolean;
  nodeStatusColor: (status: string) => string | undefined;
  nodeStatusAnsi: (status: string) => 'green' | 'yellow' | 'red' | 'gray' | 'white' | undefined;
}

export const theme: Theme = {
  colors,
  dimensions,
  tokens: chatterboxTheme,
  ansi: chatterboxAnsi,
  isNoColor,
  nodeStatusColor(status: string) {
    if (isNoColor()) return undefined;
    switch (status.toLowerCase()) {
      case 'completed':
      case 'done':
        return colors.status.success;
      case 'running':
      case 'in_progress':
        return colors.brand.primary;
      case 'failed':
      case 'blocked':
        return colors.status.error;
      case 'awaiting_approval':
      case 'review':
        return colors.status.warning;
      case 'pending':
      default:
        return colors.fg.subtle;
    }
  },
  nodeStatusAnsi(status: string) {
    if (isNoColor()) return undefined;
    switch (status.toLowerCase()) {
      case 'completed':
      case 'done':
        return 'green';
      case 'running':
      case 'in_progress':
        return 'yellow';
      case 'failed':
      case 'blocked':
        return 'red';
      case 'awaiting_approval':
      case 'review':
        return 'yellow';
      case 'pending':
      default:
        return 'gray';
    }
  },
};
