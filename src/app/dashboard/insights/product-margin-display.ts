export const UNKNOWN_MARGIN_LABEL = '—'

export const PRODUCT_MARGIN_BAR = {
  high: '#2E7D32',
  mid: '#66BB6A',
  low: '#FFA726',
  unknown: '#D4D4D8',
} as const

export function rankingMoneyText(
  value: number | null,
  formatNumber: (value: number) => string,
): string {
  if (value == null) return UNKNOWN_MARGIN_LABEL
  return formatNumber(value)
}

export function productMarginPercent(
  marginPerUnit: number | null,
  avgSalePrice: number,
): number | null {
  if (marginPerUnit == null || !(avgSalePrice > 0)) return null
  return (marginPerUnit / avgSalePrice) * 100
}

export function productMarginBarFill(marginPct: number | null): string {
  if (marginPct == null) return PRODUCT_MARGIN_BAR.unknown
  if (marginPct > 60) return PRODUCT_MARGIN_BAR.high
  if (marginPct < 30) return PRODUCT_MARGIN_BAR.low
  return PRODUCT_MARGIN_BAR.mid
}
