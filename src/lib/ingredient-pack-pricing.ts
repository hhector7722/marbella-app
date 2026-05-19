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
