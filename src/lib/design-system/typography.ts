/**
 * Marbella Design System (MDS) — typographic scale.
 * Solo definición de tokens. Sin componentes React.
 */

export const typography = {
  display: {
    fontSize: '2rem',
    lineHeight: '2.5rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
  },
  title: {
    fontSize: '1.25rem',
    lineHeight: '1.75rem',
    fontWeight: 700,
    letterSpacing: '-0.01em',
  },
  body: {
    fontSize: '0.875rem',
    lineHeight: '1.25rem',
    fontWeight: 500,
    letterSpacing: '0',
  },
  label: {
    fontSize: '0.75rem',
    lineHeight: '1rem',
    fontWeight: 700,
    letterSpacing: '0.04em',
  },
  caption: {
    fontSize: '0.625rem',
    lineHeight: '0.875rem',
    fontWeight: 600,
    letterSpacing: '0.06em',
  },
} as const

export type TypographyToken = keyof typeof typography
