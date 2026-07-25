/**
 * Marbella Design System (MDS) — spacing scale.
 * Base 4px. Sin valores arbitrarios fuera de esta escala.
 */

const BASE = 4

export const spacing = {
  0: 0,
  1: BASE * 1, // 4
  2: BASE * 2, // 8
  3: BASE * 3, // 12
  4: BASE * 4, // 16
  5: BASE * 5, // 20
  6: BASE * 6, // 24
  8: BASE * 8, // 32
  10: BASE * 10, // 40
  12: BASE * 12, // 48 — mínimo táctil
  16: BASE * 16, // 64
  20: BASE * 20, // 80
  24: BASE * 24, // 96
} as const

export type SpacingToken = keyof typeof spacing

/** Convierte un token de spacing a string CSS (`px`). */
export function spacingPx(token: SpacingToken): `${number}px` {
  return `${spacing[token]}px`
}
