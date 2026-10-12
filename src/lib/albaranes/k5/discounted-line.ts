export type ReviewedDiscountedLine = {
  grossUnitPrice: number
  discountPercent: number
  lineTotal: number
  effectiveUnitPrice: number
}

/** The document amount is authoritative after the printed discount reconciles. */
export function reviewDiscountedLine(input: {
  quantity: number | null | undefined
  grossUnitPrice: number | null | undefined
  discountPercent: number | null | undefined
  lineTotal: number | null | undefined
}): ReviewedDiscountedLine | null {
  const quantity = Number(input.quantity)
  const grossUnitPrice = Number(input.grossUnitPrice)
  const discountPercent = Number(input.discountPercent)
  const lineTotal = Number(input.lineTotal)
  if (input.discountPercent == null || input.lineTotal == null
    || !Number.isFinite(quantity) || quantity <= 0
    || !Number.isFinite(grossUnitPrice) || grossUnitPrice <= 0
    || !Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent >= 100
    || !Number.isFinite(lineTotal) || lineTotal <= 0) return null

  const expected = quantity * grossUnitPrice * (1 - discountPercent / 100)
  if (Math.abs(expected - lineTotal) > 0.03) return null
  const effectiveUnitPrice = lineTotal / quantity
  if (!Number.isFinite(effectiveUnitPrice) || effectiveUnitPrice <= 0) return null
  return { grossUnitPrice, discountPercent, lineTotal, effectiveUnitPrice }
}
