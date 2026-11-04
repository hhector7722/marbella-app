import { PLATO_MARBELLA_SLOTS, type PlatoMarbellaSlot } from './carta-plato-marbella.ts'

export type MarbellaEditorOption = {
  articulo_id: number
  articulo_nombre: string
  carta_nombre: string
  recipe_name: string
  recipe_id: string
  photo_url: string | null
  plato_marbella_slot: PlatoMarbellaSlot | null
  plato_marbella_is_menu_price: boolean
  is_hidden: boolean
}

type TpvRecipeLink = { articulo_id: number; recipe_id: string | null }
type Article = { id: number; nombre: string }
type Recipe = { id: string; name: string; photo_url: string | null; is_sellable: boolean | null }
type Override = {
  articulo_id: number
  override_nombre_es: string | null
  override_nombre: string | null
  is_hidden: boolean | null
  plato_marbella_slot: string | null
  plato_marbella_is_menu_price: boolean | null
}

/** Catálogo para el editor: incluye opciones ocultas (la vista de la carta las excluye).
 *  Solo acepta artículos TPV vinculados a recetas VENDIBLES; nunca elaboraciones internas.
 */
export function buildPlatoMarbellaEditorOptions(
  mappings: readonly TpvRecipeLink[],
  articles: readonly Article[],
  recipes: readonly Recipe[],
  overrides: readonly Override[],
): MarbellaEditorOption[] {
  const byArticle = new Map(articles.map((article) => [article.id, article]))
  const byRecipe = new Map(recipes.map((recipe) => [recipe.id, recipe]))
  const byOverride = new Map(overrides.map((override) => [override.articulo_id, override]))

  return mappings.flatMap((mapping): MarbellaEditorOption[] => {
    const article = byArticle.get(mapping.articulo_id)
    const recipe = mapping.recipe_id ? byRecipe.get(mapping.recipe_id) : null
    if (!article || recipe?.is_sellable !== true) return []

    const override = byOverride.get(mapping.articulo_id)
    const rawSlot = override?.plato_marbella_slot ?? null
    const slot = rawSlot && PLATO_MARBELLA_SLOTS.includes(rawSlot as PlatoMarbellaSlot)
      ? rawSlot as PlatoMarbellaSlot
      : null

    return [{
      articulo_id: mapping.articulo_id,
      articulo_nombre: article.nombre,
      carta_nombre: override?.override_nombre_es?.trim()
        || override?.override_nombre?.trim()
        || article.nombre,
      recipe_name: recipe.name,
      recipe_id: recipe.id,
      photo_url: recipe.photo_url,
      plato_marbella_slot: slot,
      plato_marbella_is_menu_price: override?.plato_marbella_is_menu_price === true,
      is_hidden: override?.is_hidden === true,
    }]
  }).sort((a, b) =>
    a.recipe_name.localeCompare(b.recipe_name, 'es', { sensitivity: 'base' })
    || a.articulo_id - b.articulo_id
  )
}

export function eligiblePlatoMarbellaOptions(rows: readonly MarbellaEditorOption[]): MarbellaEditorOption[] {
  return rows.filter((row) =>
    !row.plato_marbella_is_menu_price &&
    (!row.plato_marbella_slot || row.is_hidden)
  )
}
