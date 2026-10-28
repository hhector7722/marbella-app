/** Deep link used by newly created alerts and by notifications created before this feature. */
export function albaranPriceChangeUrl(invoiceId: string): string {
  return `/dashboard/albaranes?id=${encodeURIComponent(invoiceId)}&price_changes=1`
}

export function notificationDestination(row: {
  type: string
  action_url: string
  entity_id: string | null
}): string {
  if (row.type === 'albaran_price_variation'
    && row.entity_id
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.entity_id)) {
    return albaranPriceChangeUrl(row.entity_id)
  }
  return row.action_url
}

export const IMPORTANT_PRICE_DELTA_RATIO = 0.25

export function priceChangeRatio(priceBefore: number | null, priceAfter: number | null,
  locked = false): number | null {
  if (locked || priceBefore == null || priceAfter == null || !Number.isFinite(priceBefore)
    || !Number.isFinite(priceAfter) || priceBefore <= 0 || priceAfter < 0) return null
  return (priceAfter - priceBefore) / priceBefore
}

export function isImportantPriceChange(priceBefore: number | null, priceAfter: number | null,
  locked = false): boolean {
  const ratio = priceChangeRatio(priceBefore, priceAfter, locked)
  return ratio != null && Math.abs(ratio) > IMPORTANT_PRICE_DELTA_RATIO
}
