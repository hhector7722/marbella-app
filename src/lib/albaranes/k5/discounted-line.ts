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
    || !Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100
    || !Number.isFinite(lineTotal) || lineTotal < 0
    || ((discountPercent === 100) !== (lineTotal === 0))) return null

  const effectiveUnitPrice = lineTotal / quantity
  if (!Number.isFinite(effectiveUnitPrice) || effectiveUnitPrice < 0) return null
  const expectedNetUnitPrice = grossUnitPrice * (1 - discountPercent / 100)
  // El desfase admitido es como máximo medio céntimo por unidad, no
  // 0,03 € por línea. Así se admiten líneas grandes realmente redondeadas
  // sin tolerar importes de proveedores económicamente contradictorios.
  if (Math.abs(expectedNetUnitPrice - effectiveUnitPrice) > 0.005000001) return null
  return { grossUnitPrice, discountPercent, lineTotal, effectiveUnitPrice }
}
