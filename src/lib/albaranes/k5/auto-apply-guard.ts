type Candidate = {
  reviewReasons: unknown
  warnings: unknown
  lineId: string | null
  mappingVersionId: string
  ingredientId: string
  lineQuantity: unknown
  observedUnitPrice: unknown
  physicalQuantity: unknown
  purchaseQuantity: unknown
  normalizedUnitPrice: unknown
  lineUnit: string
  baseUnit: string
  purchaseUnit: string
  mappingReusable: boolean
  alreadyConfirmed: boolean
  pendingOrder: boolean
}

function hasItems(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0
}

function positive(value: unknown): boolean {
  if (value == null || value === '') return false
  const number = Number(value)
  return Number.isFinite(number) && number > 0
}

/** Puerta común posterior a la procedencia; nunca depende del extractor. */
export function commonAutoApplyBlockReason(candidate: Candidate): string | null {
  if (hasItems(candidate.reviewReasons)) return 'review_reasons_present'
  if (hasItems(candidate.warnings)) return 'warnings_present'
  if (!candidate.lineId || !candidate.mappingVersionId || !candidate.ingredientId) {
    return 'line_mapping_or_ingredient_missing'
  }
  if (![candidate.lineQuantity, candidate.observedUnitPrice, candidate.physicalQuantity,
    candidate.purchaseQuantity, candidate.normalizedUnitPrice].every(positive)) {
    return 'economic_magnitudes_incomplete'
  }
  if (!candidate.lineUnit || !candidate.baseUnit || !candidate.purchaseUnit) {
    return 'canonical_units_incomplete'
  }
  if (!candidate.mappingReusable) return 'mapping_not_reusable_leaf'
  if (candidate.alreadyConfirmed) return 'already_confirmed'
  if (candidate.pendingOrder) return 'pending_order_requires_allocation'
  return null
}
