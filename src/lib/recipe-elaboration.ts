import { RECIPE_UNIT_OPTIONS } from './recipe-cost.ts'

export type RecipeKind = 'sellable' | 'internal'

export const RECIPE_KIND_OPTIONS: { value: RecipeKind; label: string }[] = [
  { value: 'sellable', label: 'Vendible' },
  { value: 'internal', label: 'Elaboración interna' },
]

const YIELD_UNITS = new Set(RECIPE_UNIT_OPTIONS.map((option) => option.value))

export function isInternalRecipe(isSellable: boolean | null | undefined): boolean {
  return isSellable === false
}

/** Cantidad de rendimiento válida: finita y mayor que cero. Vacío es null. */
export function parseYieldQuantity(raw: string): number | null {
  const text = raw.trim().replace(',', '.')
  if (!text) return null
  const value = Number(text)
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}

export function isCanonicalYieldUnit(unit: string): boolean {
  return YIELD_UNITS.has(unit as (typeof RECIPE_UNIT_OPTIONS)[number]['value'])
}

export type YieldSaveResult =
  | { ok: true; yield_quantity: number | null; yield_unit: string | null }
  | { ok: false; message: string }

/**
 * Vendible: ambos vacíos se guardan null/null. Si hay uno, hacen falta los dos.
 * Interna: cantidad y unidad son obligatorias.
 */
export function yieldFieldsForSave(
  quantityRaw: string,
  unit: string,
  required: boolean,
): YieldSaveResult {
  const quantityText = quantityRaw.trim()
  const unitText = unit.trim()
  const quantity = parseYieldQuantity(quantityText)
  const unitOk = isCanonicalYieldUnit(unitText)

  if (!required && !quantityText && !unitText) {
    return { ok: true, yield_quantity: null, yield_unit: null }
  }
  if (!quantityText || quantity === null) {
    return { ok: false, message: 'El rendimiento tiene que ser un número mayor que cero' }
  }
  if (!unitOk) {
    return { ok: false, message: 'Elige la unidad del rendimiento' }
  }
  return { ok: true, yield_quantity: quantity, yield_unit: unitText }
}

export function formatYieldQuantity(quantity: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 }).format(quantity)
}

export function elaborationUnitCost(
  totalCostEur: number | null | undefined,
  yieldQuantity: number | null | undefined,
): number | null {
  if (totalCostEur == null || yieldQuantity == null) return null
  if (!Number.isFinite(totalCostEur) || !Number.isFinite(yieldQuantity) || yieldQuantity <= 0) return null
  return totalCostEur / yieldQuantity
}

/**
 * Importe de presentación. El número que entra no se redondea para otros cálculos.
 * A partir de un céntimo, dos decimales. Por debajo, se conservan cifras
 * significativas: 4.80 / 1000 se ve como 0.0048 €, no como 0.004 € ni 0.00 €.
 * Un coste ausente es raya.
 */
export function formatElaborationCostEur(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return '—'
  if (amount >= 0.01 || amount <= 0) return `${amount.toFixed(2)} €`
  const precise = Number(amount.toPrecision(4))
  const fixed = precise.toFixed(12).replace(/0+$/, '').replace(/\.$/, '')
  if (fixed !== '0') return `${fixed} €`
  return `${precise.toPrecision(4)} €`
}

export const RECIPE_COST_V2_STATUS_LABELS: Record<string, string> = {
  MISSING_PRICE: 'Falta el precio de un ingrediente',
  INCOMPATIBLE_UNITS: 'Hay unidades que no convierten',
  MISSING_YIELD: 'Falta el rendimiento',
  CYCLE: 'La composición se cruza consigo misma',
  MAX_DEPTH_EXCEEDED: 'La composición es demasiado profunda',
  RECIPE_NOT_FOUND: 'No se encuentra la receta',
}

export function recipeCostV2StatusLabel(status: string): string {
  return RECIPE_COST_V2_STATUS_LABELS[status] ?? status
}
