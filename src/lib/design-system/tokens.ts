/**
 * Marbella Design System (MDS) — color tokens.
 * Única fuente de verdad para color. Los componentes no inventan valores.
 */

export const colors = {
  background: '#F8FAFC',
  surface: '#FFFFFF',
  border: '#F4F4F5',
  primary: '#36606F',
  secondary: '#5B8FB9',
  muted: '#71717A',
  foreground: '#18181B',
  success: '#16A34A',
  warning: '#D97706',
  danger: '#DC2626',
} as const

export type ColorToken = keyof typeof colors
