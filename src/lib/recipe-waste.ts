export type RecipeStockRequirementRow = {
  ok: boolean
  ingredient_count: number
  ingredient_id: string | null
  quantity_base: number | null
  unit_base: string | null
  errors?: unknown
}

export type RecipeWasteItem = {
  ingredient_id: string
  quantity_base: number
  unit_base: string
  description: string
}

export class RecipeWasteError extends Error {
  readonly expansionErrors: unknown

  constructor(message: string, expansionErrors?: unknown) {
    super(message)
    this.name = 'RecipeWasteError'
    this.expansionErrors = expansionErrors ?? null
  }
}

export function recipeWasteItemsFromRows(
  rows: RecipeStockRequirementRow[],
  recipeName: string,
  units: number,
): RecipeWasteItem[] {
  if (rows.length === 0) {
    throw new RecipeWasteError('No se pudo cargar la expansión de la receta.')
  }

  const invalid = rows.find((row) => row.ok !== true)
  if (invalid) {
    throw new RecipeWasteError(
      'No se puede registrar la merma porque la receta no expande a materias primas seguras.',
      invalid.errors ?? null,
    )
  }

  if (rows.every((row) => row.ingredient_count === 0)) {
    throw new RecipeWasteError('Esta receta no tiene materias primas configuradas.')
  }

  const description = `Merma receta: ${recipeName} × ${units} ud`
  const items: RecipeWasteItem[] = []

  for (const row of rows) {
    if (row.ingredient_id == null) {
      throw new RecipeWasteError('La expansión de la receta no es coherente.')
    }

    const unit = row.unit_base?.trim() ?? ''
    if (row.quantity_base == null || !Number.isFinite(row.quantity_base) || unit === '') {
      throw new RecipeWasteError('La expansión de la receta trae una cantidad que no se puede registrar.')
    }

    if (row.quantity_base < 0) {
      throw new RecipeWasteError('La expansión de la receta trae una cantidad que no se puede registrar.')
    }

    if (row.quantity_base === 0) continue

    items.push({
      ingredient_id: row.ingredient_id,
      quantity_base: row.quantity_base,
      unit_base: unit,
      description,
    })
  }

  if (items.length === 0) {
    throw new RecipeWasteError('No se pudo calcular consumo para esta receta.')
  }

  return items
}
