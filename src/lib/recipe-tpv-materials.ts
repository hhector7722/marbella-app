export type AlbaranLearnedName = {
  id: string
  supplier_id: number | null
  supplier_item_name: string
  supplier_name: string | null
  ingredient_id: string
}

export type RecipeStockProjectionRow = {
  ok: boolean
  ingredient_count: number
  ingredient_id: string | null
  ingredient_name: string | null
  quantity_base: number | null
  unit_base: string | null
  errors?: unknown
  contributions?: unknown
}

export type RecipeMaterialLine = {
  ingredient_id: string
  ingredient_name: string
  quantity_base: number
  unit_base: string
}

export type RecipeMaterialMatchRow = RecipeMaterialLine & {
  albaran: AlbaranLearnedName[]
}

export type RecipePhysicalProjection =
  | {
      status: 'ok'
      ingredient_count: number
      rows: RecipeMaterialLine[]
    }
  | {
      status: 'invalid'
      rows: []
      error_codes?: string[]
    }

export type RecipeMaterialProjection =
  | {
      status: 'ok'
      ingredient_count: number
      rows: RecipeMaterialMatchRow[]
    }
  | {
      status: 'invalid'
      rows: []
      error_codes?: string[]
    }

export const TPV_INTERNAL_RECIPE_ERROR = 'Solo se pueden mapear recetas vendibles.'

const RECIPE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const TPV_EXPANSION_CONCURRENCY = 8

export function recipeIdsForTpvExpansion(sellableIds: readonly string[], mappedIds: readonly string[]): string[] {
  return [...new Set([...sellableIds, ...mappedIds].filter((id) => id.length > 0))]
}

export function sellableSelectorIds(recipes: readonly { id: string; is_sellable: boolean | null }[]): string[] {
  return recipes.filter((recipe) => recipe.is_sellable === true).map((recipe) => recipe.id)
}

export function legacyInternalMappingView(input: {
  mappedRecipeId: string | null
  sellableIds: ReadonlySet<string>
}): { mapped: boolean; offeredInSelector: boolean } {
  if (!input.mappedRecipeId) return { mapped: false, offeredInSelector: false }
  return {
    mapped: true,
    offeredInSelector: input.sellableIds.has(input.mappedRecipeId),
  }
}

export function guardTpvMappingWrite(input: {
  articuloId: unknown
  recipeId: unknown
  factor: unknown
  recipe: { is_sellable: boolean | null } | null
}):
  | { ok: true; articuloId: number; recipeId: string; factor: number }
  | { ok: false; error: string } {
  const articuloId = typeof input.articuloId === 'number' ? input.articuloId : Number(input.articuloId)
  if (!Number.isInteger(articuloId) || articuloId <= 0) {
    return { ok: false, error: 'Artículo TPV inválido.' }
  }

  const recipeId = String(input.recipeId ?? '').trim()
  if (!RECIPE_ID_RE.test(recipeId)) {
    return { ok: false, error: 'Receta inválida.' }
  }

  const factor = typeof input.factor === 'number' ? input.factor : Number(input.factor)
  if (!Number.isFinite(factor) || factor <= 0) {
    return { ok: false, error: 'El factor de porción tiene que ser un número mayor que cero.' }
  }

  if (!input.recipe) return { ok: false, error: 'La receta no existe.' }
  if (input.recipe.is_sellable !== true) {
    return { ok: false, error: TPV_INTERNAL_RECIPE_ERROR }
  }

  return { ok: true, articuloId, recipeId, factor }
}

function errorCodesFrom(errors: unknown): string[] {
  if (!Array.isArray(errors)) return []
  const codes: string[] = []
  for (const item of errors) {
    if (!item || typeof item !== 'object' || !('status' in item)) continue
    const status = (item as { status?: unknown }).status
    if (typeof status === 'string' && status.length > 0) codes.push(status)
  }
  return codes
}

function invalidProjection(rows: readonly RecipeStockProjectionRow[]): RecipePhysicalProjection {
  const codes = [...new Set(rows.flatMap((row) => errorCodesFrom(row.errors)))]
  return codes.length > 0 ? { status: 'invalid', rows: [], error_codes: codes } : { status: 'invalid', rows: [] }
}

function physicalIngredientId(value: string | null): string | null {
  const id = value?.trim() ?? ''
  return id.length > 0 ? id : null
}

export function projectRecipeStockRows(rows: readonly RecipeStockProjectionRow[]): RecipePhysicalProjection {
  if (rows.length === 0 || rows.some((row) => row.ok !== true)) {
    return invalidProjection(rows)
  }

  const declaredCounts = new Set(rows.map((row) => row.ingredient_count))
  const ingredientCount = rows[0]?.ingredient_count
  if (
    declaredCounts.size !== 1
    || typeof ingredientCount !== 'number'
    || !Number.isInteger(ingredientCount)
    || ingredientCount < 0
  ) {
    return invalidProjection(rows)
  }

  const physical = rows.flatMap((row) => {
    const ingredientId = physicalIngredientId(row.ingredient_id)
    return ingredientId == null ? [] : [{ row, ingredientId }]
  })

  if (ingredientCount === 0) {
    if (physical.length > 0) return invalidProjection(rows)
    return { status: 'ok', ingredient_count: 0, rows: [] }
  }

  if (physical.length === 0) return invalidProjection(rows)

  const lines: RecipeMaterialLine[] = []
  const seen = new Set<string>()
  for (const { row, ingredientId } of physical) {
    const unit = row.unit_base?.trim() ?? ''
    if (
      row.quantity_base == null
      || !Number.isFinite(row.quantity_base)
      || row.quantity_base <= 0
      || unit === ''
      || seen.has(ingredientId)
    ) {
      return invalidProjection(rows)
    }
    seen.add(ingredientId)
    lines.push({
      ingredient_id: ingredientId,
      ingredient_name: row.ingredient_name?.trim() || ingredientId,
      quantity_base: row.quantity_base,
      unit_base: unit,
    })
  }

  if (seen.size !== ingredientCount) return invalidProjection(rows)

  return {
    status: 'ok',
    ingredient_count: ingredientCount,
    rows: lines,
  }
}

export function attachSupplierMappings(
  projection: RecipePhysicalProjection,
  byIngredient: ReadonlyMap<string, readonly AlbaranLearnedName[]>,
): RecipeMaterialProjection {
  if (projection.status !== 'ok') return { ...projection, rows: [] }
  return {
    ...projection,
    rows: projection.rows.map((row) => ({
      ...row,
      albaran: [...(byIngredient.get(row.ingredient_id) ?? [])],
    })),
  }
}

export function formatMaterialLine(name: string, quantity: number, unit: string): string {
  return `${name} · ${quantity} ${unit}`
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await fn(items[index])
    }
  })
  await Promise.all(workers)
  return results
}
