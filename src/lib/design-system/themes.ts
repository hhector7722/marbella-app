/**
 * Marbella Design System (MDS) — semantic themes.
 * Light is active for new MDS work. Dark / High Contrast are reserved shapes.
 */

import { colors } from './tokens'

export const themeIds = ['light', 'dark', 'high-contrast'] as const

export type ThemeId = (typeof themeIds)[number]

/**
 * Semantic color contract shared by every theme.
 * `muted` = texto secundario. `mutedSurface` = fondo atenuado (compat shadcn `bg-muted`).
 */
export type SemanticThemeColors = {
  background: string
  surface: string
  foreground: string
  border: string
  primary: string
  primaryForeground: string
  secondary: string
  secondaryForeground: string
  muted: string
  mutedSurface: string
  success: string
  warning: string
  danger: string
}

const lightTheme = {
  background: colors.background,
  surface: colors.surface,
  foreground: colors.foreground,
  border: colors.border,
  primary: colors.primary,
  primaryForeground: colors.surface,
  secondary: colors.secondary,
  secondaryForeground: colors.surface,
  muted: colors.muted,
  mutedSurface: colors.border,
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
} as const satisfies SemanticThemeColors

/**
 * Dark / high-contrast: same contract, placeholder values.
 * Not applied globally until a future adoption sprint.
 */
const darkTheme = {
  background: '#0F172A',
  surface: '#1E293B',
  foreground: '#F8FAFC',
  border: '#334155',
  primary: '#5B8FB9',
  primaryForeground: '#0F172A',
  secondary: '#36606F',
  secondaryForeground: '#F8FAFC',
  muted: '#94A3B8',
  mutedSurface: '#334155',
  success: '#22C55E',
  warning: '#FBBF24',
  danger: '#F87171',
} as const satisfies SemanticThemeColors

const highContrastTheme = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  foreground: '#000000',
  border: '#000000',
  primary: '#000000',
  primaryForeground: '#FFFFFF',
  secondary: '#000000',
  secondaryForeground: '#FFFFFF',
  muted: '#000000',
  mutedSurface: '#FFFFFF',
  success: '#166534',
  warning: '#92400E',
  danger: '#991B1B',
} as const satisfies SemanticThemeColors

export const themes = {
  light: lightTheme,
  dark: darkTheme,
  'high-contrast': highContrastTheme,
} as const

export type Themes = typeof themes

/** Theme applied by default for MDS (CSS vars `--mds-*`). */
export const defaultThemeId: ThemeId = 'light'
