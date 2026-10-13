/** Categorías de receta alineadas con `public.categories` (scope = menu). */

export type MenuCategoryRow = {
  id: string
  name: string
  slug: string | null
  parent_id: string | null
  sort_order: number | null
}

export type MenuCategoryOverrideRow = {
  category_id: string
  override_name_es: string | null
}

/**
 * Texto denormalizado guardado en `recipes.category` (ES, estable para listados legacy).
 */
export function denormalizedRecipeCategoryName(row: MenuCategoryRow): string {
  return row.name?.trim() || ''
}

/** Orden carta: sort_order, luego nombre. */
export function sortMenuCategoriesForRecipes(rows: MenuCategoryRow[]): MenuCategoryRow[] {
  return [...rows].sort((a, b) => {
    const da = (a.sort_order ?? 0) - (b.sort_order ?? 0)
    if (da !== 0) return da
    return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
  })
}

const byId = (rows: MenuCategoryRow[]) => new Map(rows.map((r) => [r.id, r]))

export function labelMenuCategoryForRecipesEs(
  row: MenuCategoryRow,
  allRows: MenuCategoryRow[],
  mcoEsByCategoryId: Map<string, string | null>,
): string {
  const map = byId(allRows)
  const own = mcoEsByCategoryId.get(row.id)?.trim() || row.name.trim()
  if (!row.parent_id) return own
  const parent = map.get(row.parent_id)
  const pLabel = parent ? (mcoEsByCategoryId.get(parent.id)?.trim() || parent.name.trim()) : ''
  const short = own.includes(' - ') ? own.split(' - ').slice(1).join(' - ').trim() : own
  return pLabel ? `${pLabel} › ${short}` : short
}

/** Valores antiguos del selector fijo → slug menú (`categories.slug`). */
export const LEGACY_RECIPE_CATEGORY_TO_MENU_SLUG: Record<string, string> = {
  tapas: 'tapas',
  entrantes: 'tapas',
  principales: 'platos-platos',
  postres: 'helados',
  bebidas: 'bebidas',
  vinos: 'bebidas',
  cocktails: 'bebidas-aperitivos',
  cóctails: 'bebidas-aperitivos',
  menús: 'menus-packs',
  menus: 'menus-packs',
}

export function resolveMenuCategoryIdFromLegacyLabel(
  label: string,
  menuRows: MenuCategoryRow[],
): string | null {
  const t = label.trim()
  if (!t) return null
  const lower = t.toLowerCase()
  for (const r of menuRows) {
    if (r.name.trim().toLowerCase() === lower) return r.id
  }
  const slug = LEGACY_RECIPE_CATEGORY_TO_MENU_SLUG[lower]
  if (slug) {
    const hit = menuRows.find((r) => r.slug === slug)
    if (hit) return hit.id
  }
  return null
}

export function isMenusPackCategory(recipe: { category?: string | null; menu_category_id?: string | null }, menusPackId: string | null) {
  const c = (recipe.category ?? '').trim()
  if (c === 'Menús') return true
  if (menusPackId && recipe.menu_category_id === menusPackId) return true
  return false
}


/** Solamente bocadillos fríos/calientes tienen los dos tamaños de precio.
 * Especiales y cualquier otra categoría permanecen siempre en Entero.
 * El slug de la categoría del menú es la autoridad; la etiqueta denormalizada
 * permite abrir las recetas antiguas mientras se carga el catálogo.
 */
export function isHalfPortionSandwichCategory(
  recipe: { category?: string | null; menu_category_id?: string | null } | null,
  categories: readonly MenuCategoryRow[],
): boolean {
  if (!recipe) return false
  const linkedCategory = categories.find((category) => category.id === recipe.menu_category_id)
  const slug = linkedCategory?.slug?.trim().toLowerCase()
  if (slug) return slug === 'bocadillos-frios' || slug === 'bocadillos-calientes'

  const label = (recipe.category ?? '')
    .trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  return label === 'bocadillos - frios' || label === 'bocadillos - calientes'
}

/** Valor en query `cat` (slug menú, `id:<uuid>` si falta slug, o `__none__`). */
export function menuCategoryToUrlParam(row: MenuCategoryRow): string {
  const s = row.slug?.trim()
  if (s) return s
  return `id:${row.id}`
}

/** Resuelve fila menú desde `cat` URL (slug, id:, nombre legible legacy). */
export function menuCategoryFromUrlParam(param: string | null, rows: MenuCategoryRow[]): MenuCategoryRow | null {
  if (!param || param === '__none__') return null
  if (param.startsWith('id:')) {
    const id = param.slice(3).trim()
    return rows.find((r) => r.id === id) ?? null
  }
  const hitSlug = rows.find((r) => r.slug === param)
  if (hitSlug) return hitSlug
  const lower = param.trim().toLowerCase()
  return rows.find((r) => r.name.trim().toLowerCase() === lower) ?? null
}
