/**
 * Marbella Design System (MDS) — CSS custom property names & maps.
 * Values live in themes.ts / tokens.ts. CSS in globals.css must stay in sync.
 */

import { themes, type SemanticThemeColors, type ThemeId } from './themes'

/** Public semantic CSS variables (utilities Tailwind + futuros componentes MDS). */
export const cssVariableNames = {
  background: '--mds-background',
  surface: '--mds-surface',
  foreground: '--mds-foreground',
  border: '--mds-border',
  primary: '--mds-primary',
  primaryForeground: '--mds-primary-foreground',
  secondary: '--mds-secondary',
  secondaryForeground: '--mds-secondary-foreground',
  muted: '--mds-muted',
  mutedSurface: '--mds-muted-surface',
  success: '--mds-success',
  warning: '--mds-warning',
  danger: '--mds-danger',
} as const satisfies Record<keyof SemanticThemeColors, `--mds-${string}`>

export type CssVariableName = (typeof cssVariableNames)[keyof typeof cssVariableNames]

/** Builds a record of CSS variable → color for a theme (tests / docs / future runtime). */
export function themeToCssVariables(
  themeId: ThemeId
): Record<CssVariableName, string> {
  const theme = themes[themeId]
  return {
    [cssVariableNames.background]: theme.background,
    [cssVariableNames.surface]: theme.surface,
    [cssVariableNames.foreground]: theme.foreground,
    [cssVariableNames.border]: theme.border,
    [cssVariableNames.primary]: theme.primary,
    [cssVariableNames.primaryForeground]: theme.primaryForeground,
    [cssVariableNames.secondary]: theme.secondary,
    [cssVariableNames.secondaryForeground]: theme.secondaryForeground,
    [cssVariableNames.muted]: theme.muted,
    [cssVariableNames.mutedSurface]: theme.mutedSurface,
    [cssVariableNames.success]: theme.success,
    [cssVariableNames.warning]: theme.warning,
    [cssVariableNames.danger]: theme.danger,
  } as Record<CssVariableName, string>
}

/** Serializes a theme as CSS custom-property declarations (no selector). */
export function serializeThemeCssVariables(themeId: ThemeId): string {
  const map = themeToCssVariables(themeId)
  return Object.entries(map)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n')
}
