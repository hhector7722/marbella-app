import { compatibleRecipeUnits } from './recipe-cost.ts'
import { isCanonicalYieldUnit } from './recipe-elaboration.ts'

/** De dónde sale el coste de la ficha. La media ración con subrecetas no está modelada. */
export type SheetCostSource = 'legacy' | 'recursive' | 'unavailable'

export function sheetCostSource(input: {
  isSellable: boolean
  hasSubrecipes: boolean
  portion: 'full' | 'half'
}): SheetCostSource {
  if (!input.isSellable) return 'recursive'
  if (!input.hasSubrecipes) return 'legacy'
  if (input.portion === 'half') return 'unavailable'
  return 'recursive'
}

/** Cantidad de un componente: finita y mayor que cero. */
export function isValidComponentQuantity(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

/** Unidades que convierten con el rendimiento de la hija. Vacío si el rendimiento no es canónico. */
export function compatibleComponentUnits(yieldUnit: string | null | undefined): string[] {
  if (!yieldUnit || !isCanonicalYieldUnit(yieldUnit)) return []
  return compatibleRecipeUnits(yieldUnit)
}

/** Una receta se puede añadir como componente solo si su rendimiento es usable. */
export function canAddRecipeComponent(candidate: {
  yieldQuantity: number | null | undefined
  yieldUnit: string | null | undefined
}): boolean {
  return isValidComponentQuantity(candidate.yieldQuantity ?? Number.NaN) && isCanonicalYieldUnit(candidate.yieldUnit ?? '')
}

export type RecipeCostComponentNode = {
  kind?: string | null
  line_id?: string | null
  status?: string | null
  cost_eur?: number | null
}

/**
 * Coste de una fila directa. `line_id` es el id de `recipe_ingredients` o de `recipe_subrecipes`.
 * Un descendiente con otro `line_id` no entra. Un fallo o un importe ausente no se convierte en 0.
 */
export function directComponentLineCost(
  components: readonly RecipeCostComponentNode[] | null | undefined,
  kind: 'ingredient' | 'subrecipe',
  lineId: string,
): { status: string; costEur: number | null } {
  const node = components?.find((component) => component.kind === kind && component.line_id === lineId)
  if (!node) return { status: 'RECIPE_NOT_FOUND', costEur: null }
  if (node.status === 'OK' && typeof node.cost_eur === 'number' && Number.isFinite(node.cost_eur)) {
    return { status: 'OK', costEur: node.cost_eur }
  }
  return { status: node.status || 'MISSING_PRICE', costEur: null }
}

export function directIngredientLineCost(
  components: readonly RecipeCostComponentNode[] | null | undefined,
  lineId: string,
): { status: string; costEur: number | null } {
  return directComponentLineCost(components, 'ingredient', lineId)
}

export function directSubrecipeLineCost(
  components: readonly RecipeCostComponentNode[] | null | undefined,
  lineId: string,
): { status: string; costEur: number | null } {
  return directComponentLineCost(components, 'subrecipe', lineId)
}

/** En recursivo la fila de ingrediente sale de v2. Legacy y media ración conservan el cálculo de línea. */
export function ingredientRowCostSource(source: SheetCostSource): 'v2' | 'client' {
  return source === 'recursive' ? 'v2' : 'client'
}

export function subrecipeWriteErrorMessage(
  error: { code?: string | null; message?: string | null },
  action: 'add' | 'save' = 'add',
): string {
  const code = error.code ?? ''
  const message = error.message ?? ''
  if (code === '23514' && /ciclo/i.test(message)) {
    return 'No se puede añadir: crearía un ciclo entre recetas.'
  }
  if (code === '23505') return 'Esta elaboración ya está incluida.'
  const fallback = message || 'Error desconocido'
  return action === 'add' ? `No se pudo añadir: ${fallback}` : `No se pudo guardar: ${fallback}`
}
