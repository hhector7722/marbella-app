/**
 * Marbella PDF Design System v2.0 — tokens.
 * Fuente de verdad: docs/design-system/Marbella-PDF-Design-System-v2.0.pdf
 *
 * Unidad canónica: pt (1 pt = 1/72"). jsPDF se crea con unit: 'pt'.
 * Tipografía ideal: Inter. En runtime usamos Helvetica (core PDF) hasta
 * embeber Inter vía addFont.
 */

export const DS_V2_VERSION = '2.0' as const

/** Hex → RGB tuple for jsPDF */
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').trim()
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = Number.parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export const DS_COLORS = {
  /** Azul corporativo — máximo ~10% de la superficie de página */
  brand: '#1F5FAF',
  brandLight: '#4F8EDC',
  grayDark: '#2F3A45',
  grayMid: '#6B7280',
  grayLight: '#D9E2EC',
  white: '#FFFFFF',
  /** Fondos de alerta (tinta suave) */
  alertInfoBg: '#E8F1FB',
  alertSuccessBg: '#E8F6EE',
  alertWarningBg: '#FFF6E5',
  alertErrorBg: '#FDECEC',
  alertInfo: '#1F5FAF',
  alertSuccess: '#1B7A4E',
  alertWarning: '#B45309',
  alertError: '#B91C1C',
} as const

export const DS_RGB = {
  brand: hexToRgb(DS_COLORS.brand),
  brandLight: hexToRgb(DS_COLORS.brandLight),
  grayDark: hexToRgb(DS_COLORS.grayDark),
  grayMid: hexToRgb(DS_COLORS.grayMid),
  grayLight: hexToRgb(DS_COLORS.grayLight),
  white: hexToRgb(DS_COLORS.white),
  alertInfoBg: hexToRgb(DS_COLORS.alertInfoBg),
  alertSuccessBg: hexToRgb(DS_COLORS.alertSuccessBg),
  alertWarningBg: hexToRgb(DS_COLORS.alertWarningBg),
  alertErrorBg: hexToRgb(DS_COLORS.alertErrorBg),
  alertInfo: hexToRgb(DS_COLORS.alertInfo),
  alertSuccess: hexToRgb(DS_COLORS.alertSuccess),
  alertWarning: hexToRgb(DS_COLORS.alertWarning),
  alertError: hexToRgb(DS_COLORS.alertError),
} as const

/** Escala tipográfica (pt). Inter → Helvetica en PDF core. */
export const DS_TYPE = {
  /** Portadas */
  display: 28,
  /** Cabeceras / títulos de sección */
  section: 18,
  /** Subtítulo de bloque */
  subtitle: 14,
  /** Cuerpo / tablas */
  body: 10,
  /** Pie, metadatos, captions */
  caption: 8,
  fontFamily: 'helvetica' as const,
} as const

/** Retícula de 8 pt */
export const DS_SPACE = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
} as const

export const DS_PAGE = {
  format: 'a4' as const,
  orientation: 'portrait' as const,
  unit: 'pt' as const,
  /** A4 en pt */
  width: 595.28,
  height: 841.89,
  /** Márgenes laterales / verticales del manual */
  marginX: 36,
  marginY: 32,
  columns: 12,
  gutter: 16,
  /** Ancho máximo de texto = 8 columnas */
  textColumns: 8,
  /** Línea divisoria cabecera/pie */
  hairline: 0.5,
  /** Logo mínimo */
  logoMinMm: 10,
} as const

export const DS_COMPANY = {
  brandName: 'MARBELLA',
  tradeName: 'Bar La Marbella',
  legalName: 'Fogo Torrat S.L.',
  cif: 'B-09761628',
  address: 'Av. Litoral 86, 08005 Barcelona',
  city: 'Barcelona',
} as const
