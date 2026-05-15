import type { CartaLang } from '@/lib/carta-menu-i18n'

export const PLATO_MARBELLA_CHILD_SLUG = 'platos-marbella'

export type PlatoMarbellaSlot = 'entrante' | 'principal' | 'guarnicion'

export type PlatoMarbellaMenuRow = {
  articulo_id: number
  precio: number | string | null
  photo_url?: string | null
  sort_order?: number | null
  category_child_slug?: string | null
  plato_marbella_slot?: string | null
  plato_marbella_is_menu_price?: boolean | null
}

export const PLATO_MARBELLA_SLOTS: PlatoMarbellaSlot[] = ['entrante', 'principal', 'guarnicion']

const SLOT_ORDER = PLATO_MARBELLA_SLOTS

export type PlatoMarbellaReorderSection = PlatoMarbellaSlot | 'unassigned'

export function platoMarbellaRowsForReorderSection(
  rows: PlatoMarbellaMenuRow[],
  section: PlatoMarbellaReorderSection
): PlatoMarbellaMenuRow[] {
  const g = groupPlatoMarbellaItems(rows)
  if (section === 'unassigned') return g.unassigned
  return g.sections[section]
}

function sortByOrder<T extends { sort_order?: number | null; articulo_id: number }>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => {
    const sa = a.sort_order ?? 9999
    const sb = b.sort_order ?? 9999
    if (sa !== sb) return sa - sb
    return a.articulo_id - b.articulo_id
  })
}

function parsePrecio(precio: number | string | null): number | null {
  if (precio == null) return null
  const n = typeof precio === 'string' ? Number(precio) : precio
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

export function isPlatoMarbellaSubcategory(row: { category_child_slug?: string | null }): boolean {
  return (row.category_child_slug?.trim() ?? '') === PLATO_MARBELLA_CHILD_SLUG
}

export function isPlatoMarbellaSubcategoryRows(rows: PlatoMarbellaMenuRow[]): boolean {
  const first = rows[0]
  return first != null && isPlatoMarbellaSubcategory(first)
}

export function isPlatoMarbellaMenuSub(
  subKey: string,
  rows: PlatoMarbellaMenuRow[],
  platoMarbellaCategoryId: string | null
): boolean {
  if (isPlatoMarbellaSubcategoryRows(rows)) return true
  return platoMarbellaCategoryId != null && subKey === platoMarbellaCategoryId
}

export type GroupedPlatoMarbella = {
  menuPrice: number | null
  menuPriceArticuloId: number | null
  sections: Record<PlatoMarbellaSlot, PlatoMarbellaMenuRow[]>
  unassigned: PlatoMarbellaMenuRow[]
  priceOnlyRows: PlatoMarbellaMenuRow[]
}

export function groupPlatoMarbellaItems(rows: PlatoMarbellaMenuRow[]): GroupedPlatoMarbella {
  const sections: Record<PlatoMarbellaSlot, PlatoMarbellaMenuRow[]> = {
    entrante: [],
    principal: [],
    guarnicion: [],
  }
  const unassigned: PlatoMarbellaMenuRow[] = []
  const priceOnlyRows: PlatoMarbellaMenuRow[] = []

  for (const row of rows) {
    if (row.plato_marbella_is_menu_price) {
      priceOnlyRows.push(row)
      continue
    }
    const slot = row.plato_marbella_slot as PlatoMarbellaSlot | null | undefined
    if (slot && SLOT_ORDER.includes(slot)) {
      sections[slot].push(row)
    } else if (!row.plato_marbella_is_menu_price) {
      unassigned.push(row)
    }
  }

  for (const k of SLOT_ORDER) {
    sections[k] = sortByOrder(sections[k])
  }

  let menuPrice: number | null = null
  let menuPriceArticuloId: number | null = null

  const priceRow = sortByOrder(priceOnlyRows)[0]
  if (priceRow) {
    menuPrice = parsePrecio(priceRow.precio)
    menuPriceArticuloId = priceRow.articulo_id
  }

  if (menuPrice == null) {
    const fallback = sortByOrder(
      rows.filter((r) => !r.plato_marbella_slot && !r.plato_marbella_is_menu_price)
    )[0]
    if (fallback) {
      menuPrice = parsePrecio(fallback.precio)
      menuPriceArticuloId = fallback.articulo_id
    }
  }

  return {
    menuPrice,
    menuPriceArticuloId,
    sections,
    unassigned: sortByOrder(unassigned),
    priceOnlyRows: sortByOrder(priceOnlyRows),
  }
}

export type MenuCategoryCatalogEntry = {
  id: string
  name: string
  parent_id: string | null
  sort_order: number | null
  slug?: string | null
}

type MenuRowWithCategory = PlatoMarbellaMenuRow & {
  category_parent_id?: string | null
  category_child_id?: string | null
  category_child_name?: string | null
  category_child_slug?: string | null
  category_child_sort_order?: number | null
  category_child_name_es?: string | null
  category_child_name_ca?: string | null
  category_child_name_en?: string | null
}

/** Artículos con tramo/precio menú bajo padre Platos → subcategoría Plato Marbella. */
export function bucketMenuRowForPlatoMarbella<T extends MenuRowWithCategory>(
  row: T,
  platoMarbellaCategoryId: string | null,
  catalog: MenuCategoryCatalogEntry[]
): T {
  if (!platoMarbellaCategoryId) return row
  if (!row.plato_marbella_slot && !row.plato_marbella_is_menu_price) return row
  const pm = catalog.find((c) => c.id === platoMarbellaCategoryId)
  if (!pm?.parent_id) return row
  if (row.category_parent_id !== pm.parent_id) return row
  if (row.category_child_id === platoMarbellaCategoryId) return row

  const slug = pm.slug?.trim() || PLATO_MARBELLA_CHILD_SLUG
  return {
    ...row,
    category_child_id: pm.id,
    category_child_name: pm.name,
    category_child_slug: slug,
    category_child_sort_order: pm.sort_order ?? row.category_child_sort_order ?? null,
    category_child_name_es: row.category_child_name_es ?? pm.name,
    category_child_name_ca: row.category_child_name_ca ?? pm.name,
    category_child_name_en: row.category_child_name_en ?? pm.name,
  }
}

export function platoMarbellaCategoryIdFromCatalog(
  catalog: MenuCategoryCatalogEntry[]
): string | null {
  return catalog.find((c) => (c.slug?.trim() ?? '') === PLATO_MARBELLA_CHILD_SLUG)?.id ?? null
}

export function platoMarbellaSlotsForLang(lang: CartaLang): Record<PlatoMarbellaSlot, string> {
  const dict = {
    es: { entrante: 'Entrante', principal: 'Plato principal', guarnicion: 'Guarnición' },
    ca: { entrante: 'Entrant', principal: 'Plat principal', guarnicion: 'Guarnició' },
    en: { entrante: 'Starter', principal: 'Main course', guarnicion: 'Side' },
  } as const
  return dict[lang]
}
