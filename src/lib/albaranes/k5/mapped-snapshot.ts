import {
  divideExact,
  isPositiveExact,
  multiplyExact,
  parseExactDecimal,
  ratio,
  toFiniteDecimalString,
  type ExactRatio,
} from './exact-decimal.ts'

export type ExactMappingInput = {
  conversionFactor: string
  lineContentQty: string
  lineContentUnit: string
  purchaseUnit: string
  baseUnit: string
}

export type ExactMappedSnapshot = {
  physicalQuantity: string
  baseUnit: string
  purchaseQuantity: string
  purchaseUnit: string
  normalizedUnitPrice: string
}

function unit(value: string): 'kg' | 'g' | 'l' | 'ml' | 'cl' | 'ud' | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (['ud', 'uds', 'u', 'un', 'unidad', 'unidades'].includes(normalized)) return 'ud'
  if (['kg', 'kilo', 'kilos'].includes(normalized)) return 'kg'
  if (['g', 'gr', 'gramo', 'gramos'].includes(normalized)) return 'g'
  if (['l', 'lt', 'litro', 'litros'].includes(normalized)) return 'l'
  if (normalized === 'ml') return 'ml'
  if (normalized === 'cl') return 'cl'
  return null
}

function convert(quantity: ExactRatio, fromValue: string, toValue: string): ExactRatio | null {
  const from = unit(fromValue)
  const to = unit(toValue)
  if (!from || !to) return null
  if (from === to) return quantity

  if (from === 'kg' && to === 'g') return multiplyExact(quantity, ratio(1000n))
  if (from === 'g' && to === 'kg') return divideExact(quantity, ratio(1000n))
  if (from === 'l' && to === 'ml') return multiplyExact(quantity, ratio(1000n))
  if (from === 'l' && to === 'cl') return multiplyExact(quantity, ratio(100n))
  if (from === 'ml' && to === 'l') return divideExact(quantity, ratio(1000n))
  if (from === 'ml' && to === 'cl') return divideExact(quantity, ratio(10n))
  if (from === 'cl' && to === 'ml') return multiplyExact(quantity, ratio(10n))
  if (from === 'cl' && to === 'l') return divideExact(quantity, ratio(100n))
  return null
}

/**
 * Misma frontera dimensional que K4: el factor debe ser exactamente el
 * contenido físico expresado en la unidad de compra. No hay fallback a 1.
 */
export function buildExactMappedSnapshot(params: {
  lineQuantity: string
  observedUnitPrice: string
  mapping: ExactMappingInput
}): ExactMappedSnapshot | null {
  const lineQuantity = parseExactDecimal(params.lineQuantity)
  const observedUnitPrice = parseExactDecimal(params.observedUnitPrice)
  const factor = parseExactDecimal(params.mapping.conversionFactor)
  const content = parseExactDecimal(params.mapping.lineContentQty)
  if (!isPositiveExact(lineQuantity) || !isPositiveExact(observedUnitPrice) || !isPositiveExact(factor) || !isPositiveExact(content)) return null

  const contentInPurchaseUnit = convert(content, params.mapping.lineContentUnit, params.mapping.purchaseUnit)
  if (!contentInPurchaseUnit) return null
  if (
    contentInPurchaseUnit.numerator !== factor.numerator
    || contentInPurchaseUnit.denominator !== factor.denominator
  ) return null

  const purchaseQuantity = multiplyExact(lineQuantity, factor)
  const physicalQuantity = convert(purchaseQuantity, params.mapping.purchaseUnit, params.mapping.baseUnit)
  const normalizedUnitPrice = divideExact(observedUnitPrice, factor)
  if (!physicalQuantity || !normalizedUnitPrice) return null

  const purchase = toFiniteDecimalString(purchaseQuantity)
  const physical = toFiniteDecimalString(physicalQuantity)
  const price = toFiniteDecimalString(normalizedUnitPrice)
  if (!purchase || !physical || !price) return null

  return {
    physicalQuantity: physical,
    baseUnit: params.mapping.baseUnit,
    purchaseQuantity: purchase,
    purchaseUnit: params.mapping.purchaseUnit,
    normalizedUnitPrice: price,
  }
}
