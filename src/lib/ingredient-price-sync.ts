/**
 * Sincronización de precio desde albaranes sin tocar unidades ni modo pack del catálogo.
 * SSOT: context/INGREDIENTS_PRECIOS_Y_ALBARANES.md
 */

export type IngredientPriceRow = {
  current_price?: number | null
  supplier_pricing_mode?: string | null
  pack_price?: number | null
  pack_units?: number | null
  pack_unit_size_qty?: number | null
  pack_unit_size_unit?: string | null
  purchase_unit?: string | null
}

/** Comparación tolerante para numeric(12,6) y redondeos de albarán. */
export function ingredientPricesEqual(a: number, b: number, relEpsilon = 1e-5): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  if (a === b) return true
  const scale = Math.max(Math.abs(a), Math.abs(b), 1)
  return Math.abs(a - b) <= relEpsilon * scale
}

/**
 * pack_price tal que compute_ingredient_current_price_from_pack devuelva targetCurrentPrice.
 * Devuelve null si faltan datos de pack.
 */
export function packPriceForTargetCurrentPrice(
  targetCurrentPrice: number,
  packUnits: number | null | undefined,
  packUnitSizeQty: number | null | undefined,
  packUnitSizeUnit: string | null | undefined,
  purchaseUnit: string | null | undefined,
  convertQty: (qty: number, from: string, to: string) => number | null
): number | null {
  const price = Number(targetCurrentPrice)
  const units = packUnits == null ? null : Number(packUnits)
  const sizeQty = packUnitSizeQty == null ? null : Number(packUnitSizeQty)
  const sizeUnit = String(packUnitSizeUnit ?? '').trim()
  const pu = String(purchaseUnit ?? 'kg').trim().toLowerCase()
  if (!Number.isFinite(price) || price < 0) return null
  if (units == null || !Number.isFinite(units) || units <= 0) return null
  if (sizeQty == null || !Number.isFinite(sizeQty) || sizeQty <= 0 || !sizeUnit) return null
  const converted = convertQty(sizeQty, sizeUnit, pu)
  if (converted == null || converted <= 0) return null
  const denom = units * converted
  if (!Number.isFinite(denom) || denom <= 0) return null
  return price * denom
}

export type IngredientPriceOnlyPatch = {
  current_price?: number
  pack_price?: number
  updated_at: string
}

/**
 * Patch mínimo para actualizar solo precio respetando supplier_pricing_mode existente.
 */
export function buildIngredientPriceOnlyPatch(
  row: IngredientPriceRow,
  targetPurchaseUnitPrice: number,
  convertQty: (qty: number, from: string, to: string) => number | null
): IngredientPriceOnlyPatch | null {
  const target = Number(targetPurchaseUnitPrice)
  if (!Number.isFinite(target) || target < 0) return null

  const mode = String(row.supplier_pricing_mode ?? 'per_purchase_unit')
  const current = Number(row.current_price ?? 0)
  const updated_at = new Date().toISOString()

  if (mode === 'per_pack') {
    const existingPack = row.pack_price == null ? null : Number(row.pack_price)
    const nextPack = packPriceForTargetCurrentPrice(
      target,
      row.pack_units,
      row.pack_unit_size_qty,
      row.pack_unit_size_unit,
      row.purchase_unit,
      convertQty
    )
    if (nextPack != null) {
      if (existingPack != null && ingredientPricesEqual(existingPack, nextPack)) return null
      return { pack_price: nextPack, updated_at }
    }
    if (ingredientPricesEqual(current, target)) return null
    return { current_price: target, updated_at }
  }

  if (ingredientPricesEqual(current, target)) return null
  return { current_price: target, updated_at }
}
