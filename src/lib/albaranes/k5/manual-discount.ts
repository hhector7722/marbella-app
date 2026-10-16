/**
 * Ajuste explícito independiente de los descuentos OCR.
 * El importe manual está expresado por unidad facturada.
 */
export type ManualDiscountReview = {
  baseUnitPrice: number
  discountPerUnit: number
  finalUnitPrice: number
  lineTotal: number
}

export function calculateManualDiscount(input: {
  quantity: number | null | undefined
  baseUnitPrice: number | null | undefined
  discountPerUnit: number | null | undefined
}): ManualDiscountReview | null {
  const { quantity, baseUnitPrice, discountPerUnit } = input
  if (quantity == null || baseUnitPrice == null || discountPerUnit == null
    || !Number.isFinite(quantity) || quantity <= 0
    || !Number.isFinite(baseUnitPrice) || baseUnitPrice <= 0
    || !Number.isFinite(discountPerUnit) || discountPerUnit <= 0
    || discountPerUnit > baseUnitPrice) return null
  const finalUnitPrice = Number((baseUnitPrice - discountPerUnit).toFixed(4))
  if (finalUnitPrice < 0 || finalUnitPrice > baseUnitPrice) return null
  const lineTotal = Number((quantity * finalUnitPrice).toFixed(2))
  if (!Number.isFinite(lineTotal) || lineTotal < 0) return null
  return { baseUnitPrice, discountPerUnit, finalUnitPrice, lineTotal }
}
