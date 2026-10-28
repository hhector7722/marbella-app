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


/** Read-only correction evidence for immutable historic K4 receipts. */
export type IngredientReclassification = {
  lineId: string
  invalidatedPriceLineId: string | null
  effectiveIngredientName: string
  priceBefore: number
  priceAfter: number
}

export function readIngredientReclassification(raw: unknown): IngredientReclassification | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (row.schema_version !== 'albaran-reclassification-v1' || row.kind !== 'correction_credit') return null
  const lineId = typeof row.line_id === 'string' ? row.line_id : ''
  const effectiveIngredientName = typeof row.new_ingredient_name === 'string' ? row.new_ingredient_name.trim() : ''
  const priceBefore = Number(row.price_before)
  const priceAfter = Number(row.price_after)
  if (!lineId || !effectiveIngredientName || !Number.isFinite(priceBefore)
    || priceBefore <= 0 || !Number.isFinite(priceAfter) || priceAfter < 0) return null
  return {
    lineId,
    invalidatedPriceLineId: typeof row.invalidated_price_line_id === 'string' ? row.invalidated_price_line_id : null,
    effectiveIngredientName,
    priceBefore,
    priceAfter,
  }
}
