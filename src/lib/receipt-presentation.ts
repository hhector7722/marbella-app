/**
 * SSOT de presentación física de una línea de compra.
 *
 * Este módulo NO decide ni escribe el precio del ingrediente.
 * Solo transforma una unidad facturada en la unidad canónica de compra
 * para que K4 pueda normalizar cantidad y precio observado.
 */

function norm(u: string | null | undefined): string {
  const s = String(u ?? '').trim().toLowerCase()
  if (s === 'u' || s === 'ud' || s === 'un' || s === 'unidad') return 'ud'
  if (s === 'lt' || s === 'l' || s === 'litro') return 'l'
  if (s === 'ml') return 'ml'
  if (s === 'cl') return 'cl'
  if (s === 'kg' || s === 'kilo') return 'kg'
  if (s === 'g' || s === 'gr') return 'g'
  return s
}

const MASS_VOLUME_CANON = new Set(['g', 'kg', 'ml', 'l', 'cl'])

export function parseMassVolumeUnit(raw: string | null | undefined): string | null {
  const n = norm(raw)
  return MASS_VOLUME_CANON.has(n) ? n : null
}

export type MassVolumeFamily = 'mass' | 'volume'

export function massVolumeFamily(u: string | null | undefined): MassVolumeFamily | null {
  const n = norm(u)
  if (n === 'g' || n === 'kg') return 'mass'
  if (n === 'ml' || n === 'l' || n === 'cl') return 'volume'
  return null
}

export function convertPricingQtyNumeric(
  quantity: number,
  fromUnit: string | null | undefined,
  toUnit: string | null | undefined
): number | null {
  if (!Number.isFinite(quantity)) return null

  const from = norm(fromUnit)
  const to = norm(toUnit)
  if (!from || !to) return null
  if (from === to) return quantity

  if (from === 'g' && to === 'kg') return quantity / 1000
  if (from === 'kg' && to === 'g') return quantity * 1000

  let ml: number
  if (from === 'ml') ml = quantity
  else if (from === 'l') ml = quantity * 1000
  else if (from === 'cl') ml = quantity * 10
  else return null

  if (to === 'ml') return ml
  if (to === 'l') return ml / 1000
  if (to === 'cl') return ml / 10
  return null
}

export type ReceiptPresentationEconomics = {
  conversionFactor: number
  normalizedUnitPrice: number
  purchaseUnit: string
}

/**
 * Normaliza una unidad facturada al precio canónico de compra.
 * Ej.: 2,49 €/unidad de 125 g -> factor 0,125 kg -> 19,92 €/kg.
 */
export function deriveReceiptPresentationEconomics(args: {
  contentQty: number | null | undefined
  contentUnit: string | null | undefined
  purchaseUnit: string | null | undefined
  observedUnitPrice: number | null | undefined
}): ReceiptPresentationEconomics | null {
  const quantity = Number(args.contentQty)
  const observed = Number(args.observedUnitPrice)
  const purchaseUnit = norm(args.purchaseUnit)

  if (!Number.isFinite(quantity) || quantity <= 0) return null
  if (!Number.isFinite(observed) || observed <= 0) return null
  if (!purchaseUnit) return null

  const conversionFactor = convertPricingQtyNumeric(quantity, args.contentUnit, purchaseUnit)
  if (conversionFactor == null || conversionFactor <= 0) return null

  const normalizedUnitPrice = observed / conversionFactor
  if (!Number.isFinite(normalizedUnitPrice) || normalizedUnitPrice <= 0) return null

  return { conversionFactor, normalizedUnitPrice, purchaseUnit }
}

export type IngredientDimensionalSource = {
  purchase_unit?: string | null
}

export function ingredientPurchaseUnitNormForMapping(row: IngredientDimensionalSource): string {
  return norm(row.purchase_unit)
}

export function billingMassVolumeNormForAuto(
  lineBillingUnitDraft: string | null | undefined,
  lineUnitFromInvoice: string | null | undefined
): string | null {
  return (
    parseMassVolumeUnit(lineBillingUnitDraft) ??
    parseMassVolumeUnit(lineUnitFromInvoice) ??
    null
  )
}

export function sameMassVolumeFamilyBillingAndIngredient(
  billingNorm: string | null | undefined,
  row: IngredientDimensionalSource
): boolean {
  const billing = billingNorm == null ? null : parseMassVolumeUnit(billingNorm)
  const purchase = parseMassVolumeUnit(ingredientPurchaseUnitNormForMapping(row))
  if (billing == null || purchase == null) return false
  return massVolumeFamily(billing) === massVolumeFamily(purchase)
}

export function sameFamilyAutomaticConversionCaption(
  billingNorm: string,
  purchaseNorm: string
): string | null {
  const billing = parseMassVolumeUnit(billingNorm)
  const purchase = parseMassVolumeUnit(purchaseNorm)
  if (billing == null || purchase == null) return null
  if (massVolumeFamily(billing) !== massVolumeFamily(purchase)) return null

  const quantity = convertPricingQtyNumeric(1, billing, purchase)
  if (quantity == null || !Number.isFinite(quantity)) return null

  const formatted = Math.abs(quantity - Math.round(quantity)) < 1e-9
    ? String(Math.round(quantity))
    : quantity.toFixed(6).replace(/\.?0+$/, '')

  return `Conversión automática: 1 ${billing} = ${formatted} ${purchase}`
}

export const ALBARAN_LINE_CONTENT_UNITS = ['l', 'ml', 'cl', 'kg', 'g', 'ud'] as const

export type DimensionalMappingSuggestion = {
  lineBillingUnit: string
  lineContentQty: string
  lineContentUnit: string
  conversionFactor: number | null
}

/**
 * El mapeo versionado del proveedor manda.
 * Si aún no existe, solo se propone una equivalencia trivial desde purchase_unit;
 * nunca se infiere una presentación de proveedor desde campos legacy del ingrediente.
 */
export function suggestedDimensionalMappingFromIngredient(
  row: IngredientDimensionalSource,
  options?: {
    lineUnitFromInvoice?: string | null
    storedBillingUnit?: string | null
    storedContentQty?: number | null
    storedContentUnit?: string | null
  }
): DimensionalMappingSuggestion {
  const lineUnitHint = String(options?.lineUnitFromInvoice ?? '').trim().toLowerCase()
  const purchaseUnit = norm(row.purchase_unit)
  const storedQty = Number(options?.storedContentQty)
  const storedUnit = norm(options?.storedContentUnit)

  if (Number.isFinite(storedQty) && storedQty > 0 && storedUnit) {
    return {
      lineBillingUnit: String(options?.storedBillingUnit ?? '').trim() || lineUnitHint || purchaseUnit || 'ud',
      lineContentQty: String(storedQty),
      lineContentUnit: storedUnit,
      conversionFactor: convertPricingQtyNumeric(storedQty, storedUnit, purchaseUnit),
    }
  }

  const billingMassVolume = parseMassVolumeUnit(lineUnitHint)
  const purchaseMassVolume = parseMassVolumeUnit(purchaseUnit)
  if (
    billingMassVolume &&
    purchaseMassVolume &&
    massVolumeFamily(billingMassVolume) === massVolumeFamily(purchaseMassVolume)
  ) {
    const factor = convertPricingQtyNumeric(1, billingMassVolume, purchaseMassVolume)
    return {
      lineBillingUnit: billingMassVolume,
      lineContentQty: factor == null ? '' : String(factor),
      lineContentUnit: purchaseMassVolume,
      conversionFactor: factor,
    }
  }

  if (purchaseUnit === 'ud') {
    return {
      lineBillingUnit: lineUnitHint || 'ud',
      lineContentQty: '1',
      lineContentUnit: 'ud',
      conversionFactor: 1,
    }
  }

  return {
    lineBillingUnit: lineUnitHint || purchaseUnit,
    lineContentQty: '1',
    lineContentUnit: purchaseUnit,
    conversionFactor: 1,
  }
}

const BILLING_UNIT_UD_HINTS = new Set([
  'ud',
  'u',
  'un',
  'unidad',
  'pieza',
  'piezas',
  'unit',
  'units',
])

export function buildAutomaticSameFamilyDimensional(
  billingNorm: string,
  row: IngredientDimensionalSource
): {
  lineBillingUnit: string
  lineContentQty: string
  lineContentUnit: string
  conversionFactor: number
} | null {
  const billing = parseMassVolumeUnit(billingNorm)
  const purchase = parseMassVolumeUnit(ingredientPurchaseUnitNormForMapping(row))
  if (
    billing == null ||
    purchase == null ||
    massVolumeFamily(billing) !== massVolumeFamily(purchase)
  ) {
    return null
  }

  const factor = convertPricingQtyNumeric(1, billing, purchase)
  if (factor == null || factor <= 0) return null

  return {
    lineBillingUnit: billing,
    lineContentQty: String(factor),
    lineContentUnit: purchase,
    conversionFactor: factor,
  }
}

export const SIMPLE_ALBARAN_UNIT_DIMENSIONAL = {
  lineBillingUnit: 'ud',
  lineContentQty: '1',
  lineContentUnit: 'ud',
} as const

export function isSimpleAlbaranUnitMapping(
  row: IngredientDimensionalSource,
  dim?: {
    lineBillingUnit?: string
    lineContentQty?: string
    lineContentUnit?: string
  },
  factor?: number | string | null
): boolean {
  if (norm(row.purchase_unit) !== 'ud') return false

  if (dim) {
    const qtyRaw = String(dim.lineContentQty ?? '1').trim().replace(',', '.')
    const quantity = qtyRaw === '' ? 1 : Number(qtyRaw)
    const contentUnit = norm(dim.lineContentUnit)
    const billingUnit = norm(dim.lineBillingUnit)

    if (contentUnit && contentUnit !== 'ud') return false
    if (Number.isFinite(quantity) && quantity !== 1) return false
    if (
      billingUnit &&
      billingUnit !== 'ud' &&
      !BILLING_UNIT_UD_HINTS.has(billingUnit)
    ) {
      return false
    }
  }

  if (factor != null && factor !== '') {
    const parsed =
      typeof factor === 'number'
        ? factor
        : Number(String(factor).replace(',', '.'))
    if (Number.isFinite(parsed) && Math.abs(parsed - 1) > 0.0001) return false
  }

  return true
}
