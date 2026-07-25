/**
 * Marbella Design System (MDS) — border radius.
 */

export const radius = {
  sm: '0.375rem', // 6px
  md: '0.5rem', // 8px
  lg: '0.75rem', // 12px
  xl: '1rem', // 16px — Bento / tarjetas
} as const

export type RadiusToken = keyof typeof radius
