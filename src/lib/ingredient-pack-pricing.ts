/**
 * Modo per_pack: si el usuario declara compra por `ud` pero el tamaño por unidad
 * es volumen (ml, l, cl) o masa (g, kg), el coste homogéneo debe guardarse en
 * `purchase_unit` = `l` o `kg` para que el trigger y las recetas conviertan bien.
 * Caso típico: 7,61 €/botella y 740 ml por botella → €/L en catálogo.
 */

function norm(u: string | null | undefined): string {
  const s = String(u ?? '')
    .trim()
    .toLowerCase()
  if (s === 'u' || s === 'ud' || s === 'un' || s === 'unidad') return 'ud'
  if (s === 'lt' || s === 'l' || s === 'litro') return 'l'
  if (s === 'ml') return 'ml'
  if (s === 'cl') return 'cl'
  if (s === 'kg' || s === 'kilo') return 'kg'
  if (s === 'g' || s === 'gr') return 'g'
  return s
}

export function resolveDeclaredPurchaseUnitWithPackContent(
  declaredPurchaseUnit: string | null | undefined,
  packUnitSizeUnit: string | null | undefined
): string {
  const dec = norm(declaredPurchaseUnit)
  const sz = norm(packUnitSizeUnit)
  const szIsVol = sz === 'ml' || sz === 'l' || sz === 'cl'
  const szIsMass = sz === 'g' || sz === 'kg'
  // El contenido del pack manda: garrafa 5 L → L; paletinas 1 ud → ud.
  if (sz === 'ud') return 'ud'
  if (szIsVol) return 'l'
  if (szIsMass) return 'kg'
  if (dec === 'ud') return 'ud'
  return dec || 'ud'
}

/** Convierte `pack_unit_size_*` a la unidad homogénea del ingrediente (`purchase_unit`). */
export function convertPackUnitSizeToPurchaseUnit(
  sizeQty: number | null | undefined,
  sizeUnit: string | null | undefined,
  purchaseUnit: string | null | undefined
): number | null {
  const qty = sizeQty == null ? null : Number(sizeQty)
  if (qty == null || !Number.isFinite(qty) || qty <= 0) return null
  const from = norm(sizeUnit)
  const to = norm(purchaseUnit)
  if (from === to) return qty
  if (to === 'l') {
    if (from === 'ml') return qty / 1000
    if (from === 'cl') return qty / 100
    if (from === 'l') return qty
    return null
  }
  if (to === 'kg') {
    if (from === 'g') return qty / 1000
    if (from === 'kg') return qty
    return null
  }
  if (to === 'ud' && from === 'ud') return qty
  return null
}

/** €/purchase_unit desde pack (misma fórmula que el trigger `compute_ingredient_current_price_from_pack`). */
export function computeEffectivePriceFromPack(args: {
  packPrice: number | null | undefined
  packUnits: number | null | undefined
  unitSizeQty: number | null | undefined
  unitSizeUnit: string | null | undefined
  purchaseUnit: string | null | undefined
}): number | null {
  const packPrice = Number(args.packPrice)
  const packUnits = Number(args.packUnits)
  if (!Number.isFinite(packPrice) || packPrice < 0) return null
  if (!Number.isFinite(packUnits) || packUnits <= 0) return null
  const sizeQty = args.unitSizeQty == null ? 1 : Number(args.unitSizeQty)
  if (!Number.isFinite(sizeQty) || sizeQty <= 0) return null
  const storePurchaseUnit = resolveDeclaredPurchaseUnitWithPackContent(
    args.purchaseUnit ?? 'ud',
    args.unitSizeUnit ?? 'ud',
  )
  const converted = convertPackUnitSizeToPurchaseUnit(
    sizeQty,
    args.unitSizeUnit,
    storePurchaseUnit,
  )
  if (converted == null || converted <= 0) return null
  const denom = packUnits * converted
  if (!Number.isFinite(denom) || denom <= 0) return null
  return packPrice / denom
}

/**
 * Litros (o kg) equivalentes por **una unidad de línea de albarán** cuando el proveedor
 * factura por botella/lata pero el catálogo costea en L/kg vía `per_pack`.
 * Ej.: 750 ml + purchase_unit=l → 0,75 (factor en mapeo si cantidad = botellas).
 */
export function suggestedAlbaranConversionFactorFromIngredient(row: {
  supplier_pricing_mode?: string | null
  purchase_unit?: string | null
  pack_unit_size_qty?: number | null
  pack_unit_size_unit?: string | null
  pack_units?: number | null
}): number | null {
  const mode = String(row.supplier_pricing_mode ?? 'per_purchase_unit')
  const pu = norm(
    resolveDeclaredPurchaseUnitWithPackContent(row.purchase_unit, row.pack_unit_size_unit)
  )
  if (mode !== 'per_pack') {
    if (pu === 'ud') return 1
    if (pu === 'l' || pu === 'kg') return 1
    return null
  }
  const perPiece = convertPackUnitSizeToPurchaseUnit(
    row.pack_unit_size_qty,
    row.pack_unit_size_unit,
    row.purchase_unit
  )
  if (perPiece == null || perPiece <= 0) return null
  const unitsInPack = row.pack_units == null ? 1 : Number(row.pack_units)
  const packCount = Number.isFinite(unitsInPack) && unitsInPack > 0 ? unitsInPack : 1
  // Una línea = una pieza facturada; el pack del catálogo describe esa pieza (pack_units=1 típico).
  if (packCount === 1) return perPiece
  return perPiece / packCount
}

/** Unidades de masa/volumen reconocidas en mapeo albarán (facturación vs almacén). */
const MASS_VOLUME_CANON = new Set(['g', 'kg', 'ml', 'l', 'cl'])

/**
 * Si el texto normaliza a g/kg/ml/l/cl, devuelve esa unidad canónica; si no, null.
 * Sirve para detectar facturación por masa/volumen frente a etiquetas libres ("caja", "garrafa").
 */
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

/**
 * Unidad de compra homogénea del ingrediente para comparar con la línea del albarán
 * (misma lógica que `resolveDeclaredPurchaseUnitWithPackContent` en escandallo).
 */
export function ingredientPurchaseUnitNormForMapping(row: IngredientDimensionalSource): string {
  return norm(resolveDeclaredPurchaseUnitWithPackContent(row.purchase_unit, row.pack_unit_size_unit))
}

/**
 * Primera unidad masa/volumen reconocible: texto de facturación del modal o unidad OCR de la línea.
 */
export function billingMassVolumeNormForAuto(
  lineBillingUnitDraft: string | null | undefined,
  lineUnitFromInvoice: string | null | undefined
): string | null {
  return (
    parseMassVolumeUnit(lineBillingUnitDraft) ?? parseMassVolumeUnit(lineUnitFromInvoice) ?? null
  )
}

/**
 * Replica de `convert_pricing_qty` (Postgres) en TS para textos de UI y factores.
 */
export function convertPricingQtyNumeric(
  pQty: number,
  pFromUnit: string | null | undefined,
  pToUnit: string | null | undefined
): number | null {
  if (!Number.isFinite(pQty)) return null
  const fu = norm(pFromUnit)
  const tu = norm(pToUnit)
  if (fu === tu) return pQty

  if (fu === 'g' && tu === 'kg') return pQty / 1000
  if (fu === 'kg' && tu === 'g') return pQty * 1000

  let qtyMl: number
  if (fu === 'ml') qtyMl = pQty
  else if (fu === 'l') qtyMl = pQty * 1000
  else if (fu === 'cl') qtyMl = pQty * 10
  else qtyMl = NaN

  if (!Number.isFinite(qtyMl)) return null

  if (tu === 'ml') return qtyMl
  if (tu === 'l') return qtyMl / 1000
  if (tu === 'cl') return qtyMl / 10
  return null
}

/**
 * Facturación (kg, g, l…) y base de compra del ingrediente en la misma familia (masa o volumen).
 * No aplica a ud ni a unidades no reconocidas.
 */
export function sameMassVolumeFamilyBillingAndIngredient(
  billingNorm: string | null | undefined,
  row: IngredientDimensionalSource
): boolean {
  const b = billingNorm == null ? null : parseMassVolumeUnit(billingNorm)
  const p = parseMassVolumeUnit(ingredientPurchaseUnitNormForMapping(row))
  if (b == null || p == null) return false
  return massVolumeFamily(b) === massVolumeFamily(p)
}

/** Texto tipo "Conversión automática: 1 kg = 1000 g" (1 unidad de facturación → unidad de almacén). */
export function sameFamilyAutomaticConversionCaption(
  billingNorm: string,
  purchaseNorm: string
): string | null {
  const b = parseMassVolumeUnit(billingNorm)
  const p = parseMassVolumeUnit(purchaseNorm)
  if (b == null || p == null) return null
  if (massVolumeFamily(b) !== massVolumeFamily(p)) return null

  const qty = convertPricingQtyNumeric(1, b, p)
  if (qty == null || !Number.isFinite(qty)) return null

  const fmt = (n: number) => {
    if (Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n))
    const t = n.toFixed(6).replace(/\.?0+$/, '')
    return t
  }

  if (Math.abs(qty - 1) < 1e-12) {
    return `Conversión automática: 1 ${b} = 1 ${p}`
  }
  return `Conversión automática: 1 ${b} = ${fmt(qty)} ${p}`
}

/** Unidades operativas para `line_content_unit` en mapeos de albarán. */
export const ALBARAN_LINE_CONTENT_UNITS = ['l', 'ml', 'cl', 'kg', 'g', 'ud'] as const

export type IngredientDimensionalSource = {
  supplier_pricing_mode?: string | null
  purchase_unit?: string | null
  pack_unit_size_qty?: number | null
  pack_unit_size_unit?: string | null
  pack_units?: number | null
}

export type DimensionalMappingSuggestion = {
  lineBillingUnit: string
  lineContentQty: string
  lineContentUnit: string
  conversionFactor: number | null
}

/**
 * Propone tríada dimensional + factor legacy de respaldo para UI de mapeo de albaranes.
 * Prioridad: mapeo guardado en BD > pack del ingrediente > unidad de compra homogénea.
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
  const storedQty = options?.storedContentQty
  const storedUnit = options?.storedContentUnit ? norm(options.storedContentUnit) : ''
  if (storedQty != null && Number.isFinite(Number(storedQty)) && Number(storedQty) > 0 && storedUnit) {
    return {
      lineBillingUnit: String(options?.storedBillingUnit ?? '').trim() || lineUnitHint || 'ud',
      lineContentQty: String(storedQty),
      lineContentUnit: storedUnit,
      conversionFactor: suggestedAlbaranConversionFactorFromIngredient(row),
    }
  }

  const mode = String(row.supplier_pricing_mode ?? 'per_purchase_unit')
  const pu = norm(row.purchase_unit)

  if (mode === 'per_pack') {
    const pq = row.pack_unit_size_qty == null ? null : Number(row.pack_unit_size_qty)
    const pUnit = row.pack_unit_size_unit ? norm(row.pack_unit_size_unit) : ''
    if (pq != null && Number.isFinite(pq) && pq > 0 && pUnit) {
      return {
        lineBillingUnit: lineUnitHint || 'ud',
        lineContentQty: String(pq),
        lineContentUnit: pUnit,
        conversionFactor: suggestedAlbaranConversionFactorFromIngredient(row),
      }
    }
  }

  if (pu === 'l' || pu === 'kg') {
    return {
      lineBillingUnit: lineUnitHint || pu,
      lineContentQty: '1',
      lineContentUnit: pu,
      conversionFactor: 1,
    }
  }

  return {
    lineBillingUnit: lineUnitHint || 'ud',
    lineContentQty: '1',
    lineContentUnit: 'ud',
    conversionFactor: suggestedAlbaranConversionFactorFromIngredient(row) ?? 1,
  }
}

const BILLING_UNIT_UD_HINTS = new Set(['ud', 'u', 'un', 'unidad', 'pieza', 'piezas', 'unit', 'units'])

/**
 * Tríada + factor para mapeo automático misma familia masa/volumen (sin formulario manual).
 * `line_content_*` expresa 1 unidad de facturación en la unidad de compra del ingrediente.
 */
export function buildAutomaticSameFamilyDimensional(
  billingNorm: string,
  row: IngredientDimensionalSource
): { lineBillingUnit: string; lineContentQty: string; lineContentUnit: string; conversionFactor: number } | null {
  const b = parseMassVolumeUnit(billingNorm)
  const purchaseNorm = ingredientPurchaseUnitNormForMapping(row)
  const p = parseMassVolumeUnit(purchaseNorm)
  if (b == null || p == null || massVolumeFamily(b) !== massVolumeFamily(p)) return null

  const factor = convertPricingQtyNumeric(1, b, p)
  if (factor == null || !Number.isFinite(factor) || factor <= 0) return null

  return {
    lineBillingUnit: b,
    lineContentQty: String(factor),
    lineContentUnit: p,
    conversionFactor: factor,
  }
}

/** Valores por defecto cuando el albarán y el catálogo facturan por unidad suelta. */
export const SIMPLE_ALBARAN_UNIT_DIMENSIONAL = {
  lineBillingUnit: 'ud',
  lineContentQty: '1',
  lineContentUnit: 'ud',
} as const

/**
 * Mapeo trivial: producto contable (croissant, paletina…) sin caja multiud ni conversión L/kg.
 * En este caso la UI puede ocultar la «ecuación» y el factor legacy.
 */
export function isSimpleAlbaranUnitMapping(
  row: IngredientDimensionalSource,
  dim?: {
    lineBillingUnit?: string
    lineContentQty?: string
    lineContentUnit?: string
  },
  factor?: number | string | null
): boolean {
  const pu = norm(
    resolveDeclaredPurchaseUnitWithPackContent(row.purchase_unit, row.pack_unit_size_unit)
  )
  if (pu !== 'ud') return false

  const mode = String(row.supplier_pricing_mode ?? 'per_purchase_unit')
  if (mode === 'per_pack') {
    const sizeUnit = norm(row.pack_unit_size_unit)
    if (sizeUnit && sizeUnit !== 'ud') return false
    const pq = row.pack_unit_size_qty == null ? null : Number(row.pack_unit_size_qty)
    if (pq != null && Number.isFinite(pq) && pq !== 1) return false
    const packUnits = row.pack_units == null ? 1 : Number(row.pack_units)
    if (!Number.isFinite(packUnits) || packUnits > 1) return false
  }

  if (dim) {
    const qtyRaw = String(dim.lineContentQty ?? '1').trim().replace(',', '.')
    const qty = qtyRaw === '' ? 1 : Number(qtyRaw)
    const contentUnit = norm(dim.lineContentUnit)
    if (contentUnit && contentUnit !== 'ud') return false
    if (Number.isFinite(qty) && qty !== 1) return false

    const billing = norm(dim.lineBillingUnit)
    if (billing && billing !== 'ud' && !BILLING_UNIT_UD_HINTS.has(billing)) return false
  }

  if (factor != null && factor !== '') {
    const f = typeof factor === 'number' ? factor : Number(String(factor).replace(',', '.'))
    if (Number.isFinite(f) && Math.abs(f - 1) > 0.0001) return false
  }

  return true
}
