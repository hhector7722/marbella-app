import {
  divideExact,
  isPositiveExact,
  multiplyExact,
  parseExactDecimal,
  ratio,
  roundExactToScale,
  toFiniteDecimalString,
  type ExactRatio,
} from './exact-decimal.ts'

export type ExactMappingInput = {
  conversionFactor: string
  lineContentQty: string
  lineContentUnit: string
  purchaseUnit: string
  baseUnit: string
  densityGPerMl?: string | null
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

function unitDimension(value: string): 'mass' | 'volume' | 'count' | null {
  const normalized = unit(value)
  if (normalized === 'kg' || normalized === 'g') return 'mass'
  if (normalized === 'l' || normalized === 'ml' || normalized === 'cl') return 'volume'
  if (normalized === 'ud') return 'count'
  return null
}

function convert(
  quantity: ExactRatio,
  fromValue: string,
  toValue: string,
  densityGPerMl?: ExactRatio | null,
): ExactRatio | null {
  const from = unit(fromValue)
  const to = unit(toValue)
  if (!from || !to) return null
  if (from === to) return quantity

  const thousand = ratio(BigInt(1000))
  const hundred = ratio(BigInt(100))
  const ten = ratio(BigInt(10))

  if (from === 'kg' && to === 'g') return multiplyExact(quantity, thousand)
  if (from === 'g' && to === 'kg') return divideExact(quantity, thousand)
  if (from === 'l' && to === 'ml') return multiplyExact(quantity, thousand)
  if (from === 'l' && to === 'cl') return multiplyExact(quantity, hundred)
  if (from === 'ml' && to === 'l') return divideExact(quantity, thousand)
  if (from === 'ml' && to === 'cl') return divideExact(quantity, ten)
  if (from === 'cl' && to === 'ml') return multiplyExact(quantity, ten)
  if (from === 'cl' && to === 'l') return divideExact(quantity, hundred)

  if (!isPositiveExact(densityGPerMl)) return null

  const fromDimension = unitDimension(fromValue)
  const toDimension = unitDimension(toValue)
  if (fromDimension === 'volume' && toDimension === 'mass') {
    const ml = convert(quantity, fromValue, 'ml')
    if (!ml) return null
    const grams = multiplyExact(ml, densityGPerMl)
    return convert(grams, 'g', toValue)
  }
  if (fromDimension === 'mass' && toDimension === 'volume') {
    const grams = convert(quantity, fromValue, 'g')
    if (!grams) return null
    const ml = divideExact(grams, densityGPerMl)
    return convert(ml, 'ml', toValue)
  }

  return null
}

/**
 * Misma frontera dimensional que K4: el factor debe ser exactamente el
 * contenido físico expresado en la unidad de compra. No hay fallback a 1.
 *
 * El precio normalizado se calcula como racional exacto y solo se redondea en
 * la frontera persistida `numeric(18,8)`, que es la escala canónica de precio
 * de ingredientes, histórico y confirmaciones de recepción.
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
  const density = params.mapping.densityGPerMl ? parseExactDecimal(params.mapping.densityGPerMl) : null
  if (!isPositiveExact(lineQuantity) || !isPositiveExact(observedUnitPrice) || !isPositiveExact(factor) || !isPositiveExact(content)) return null

  const contentInPurchaseUnit = convert(content, params.mapping.lineContentUnit, params.mapping.purchaseUnit, density)
  if (!contentInPurchaseUnit) return null
  if (
    contentInPurchaseUnit.numerator !== factor.numerator
    || contentInPurchaseUnit.denominator !== factor.denominator
  ) return null

  const purchaseQuantity = multiplyExact(lineQuantity, factor)
  const physicalQuantity = convert(purchaseQuantity, params.mapping.purchaseUnit, params.mapping.baseUnit, density)
  const normalizedUnitPrice = divideExact(observedUnitPrice, factor)
  if (!physicalQuantity || !normalizedUnitPrice) return null

  const purchase = toFiniteDecimalString(purchaseQuantity)
  const physical = toFiniteDecimalString(physicalQuantity)
  const price = toFiniteDecimalString(normalizedUnitPrice) ?? roundExactToScale(normalizedUnitPrice, 8)
  if (!purchase || !physical || !price) return null

  return {
    physicalQuantity: physical,
    baseUnit: params.mapping.baseUnit,
    purchaseQuantity: purchase,
    purchaseUnit: params.mapping.purchaseUnit,
    normalizedUnitPrice: price,
  }
}
