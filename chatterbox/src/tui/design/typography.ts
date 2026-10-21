/**
 * Typography and formatting utilities for Chatterbox TUI
 */

export const typography = {
  header: {
    title: (text: string) => text.toUpperCase(),
    meta: (key: string, value: string) => `${key}: ${value}`,
  },
  taskNode: (index: number, title: string, role: string, width = 28) => {
    const paddedTitle = title.padEnd(width, ' ');
    return `${index} ${paddedTitle} ${role}`;
  },
  roleTag: (role: string) => `[${role.toUpperCase()}]`,
  activeIndicator: (role: string, desc: string) => `ACTIVE: [${role.toUpperCase()}] ${desc}`,
} as const;
