import type { SupabaseClient } from '@supabase/supabase-js'
import type { PublicMenuRow } from '@/components/public/PublicCarta'
import { isCartaDualRacionColumnError } from '@/lib/carta-dual-racion'
import {
  resolveMenuCategoryCoverForPublicCarta,
  splitMenuCategoryCovers,
} from '@/lib/carta-category-covers'
import {
  buildMenuCategoryCatalogFromItems,
  mergeMenuCategoryCatalogs,
  type MenuCategoryCatalogEntry,
} from '@/lib/carta-plato-marbella'
import {
  CARTA_PUBLIC_MENU_COLUMNS,
  CARTA_PUBLIC_MENU_COLUMNS_BASE,
  CARTA_PUBLIC_MENU_COLUMNS_WITH_SCALE,
  isCartaPhotoScaleColumnError,
} from '@/lib/carta-menu-select'
import type { CartaPhotoScale } from '@/lib/carta-product-photo'

type CartaMenuCategoryRow = {
  id: string
  name: string
  parent_id: string | null
  sort_order: number | null
  slug: string | null
  cover_articulo_id: number | null
  cover_photo_url: string | null
  cover_photo_scale: string | null
}

export type EventCartaMenuPayload = {
  items: PublicMenuRow[]
  menuCategories: MenuCategoryCatalogEntry[]
  categoryCoverById: Record<string, string | null>
  categoryCoverScaleById: Record<string, CartaPhotoScale>
}

export async function loadEventCartaMenu(
  supabase: SupabaseClient,
  enabledProductIds: string[]
): Promise<{ ok: true; data: EventCartaMenuPayload } | { ok: false; message: string }> {
  const enabledSet = new Set(
    enabledProductIds.map((id) => String(id ?? '').trim()).filter(Boolean)
  )
  if (enabledSet.size === 0) {
    return { ok: false, message: 'Este evento no tiene productos disponibles.' }
  }

  let menuCategories: CartaMenuCategoryRow[] = []
  {
    const full = await supabase
      .from('categories')
      .select('id, name, parent_id, sort_order, slug, cover_articulo_id, cover_photo_url, cover_photo_scale')
      .eq('scope', 'menu')
      .order('sort_order', { ascending: true })
    if (!full.error && full.data) {
      menuCategories = full.data as CartaMenuCategoryRow[]
    } else {
      const leg = await supabase
        .from('categories')
        .select('id, name, parent_id, sort_order, slug, cover_articulo_id')
        .eq('scope', 'menu')
        .order('sort_order', { ascending: true })
      menuCategories = (leg.data ?? []).map((c) => ({
        ...c,
        cover_articulo_id: c.cover_articulo_id ?? null,
        cover_photo_url: null,
        cover_photo_scale: null,
      })) as CartaMenuCategoryRow[]
    }
  }

  const menuOrder = (cols: string) =>
    supabase
      .from('v_public_menu_items')
      .select(cols)
      .order('category_parent_sort_order', { ascending: true, nullsFirst: false })
      .order('category_parent_name', { ascending: true, nullsFirst: false })
      .order('category_child_sort_order', { ascending: true, nullsFirst: false })
      .order('category_child_name', { ascending: true, nullsFirst: false })
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('carta_nombre', { ascending: true })

  let { data, error } = await menuOrder(CARTA_PUBLIC_MENU_COLUMNS_WITH_SCALE)
  if (error && isCartaPhotoScaleColumnError(error.message)) {
    ;({ data, error } = await menuOrder(CARTA_PUBLIC_MENU_COLUMNS))
  }
  if (error && isCartaDualRacionColumnError(error.message)) {
    ;({ data, error } = await menuOrder(CARTA_PUBLIC_MENU_COLUMNS_BASE))
  }
  if (error) {
    return { ok: false, message: `Error cargando carta: ${error.message}` }
  }

  const allRows = (data ?? []) as unknown as PublicMenuRow[]
  const items = allRows.filter((row) => enabledSet.has(String(row.articulo_id)))
  if (items.length === 0) {
    return { ok: false, message: 'No hay productos de carta activos para este evento.' }
  }

  const catalogFromDb = menuCategories.map((c) => ({
    id: c.id,
    name: c.name,
    parent_id: c.parent_id,
    sort_order: c.sort_order,
    slug: c.slug ?? null,
  }))
  const catalogFromItems = buildMenuCategoryCatalogFromItems(items)
  const menuCatalog = mergeMenuCategoryCatalogs(catalogFromDb, catalogFromItems)

  const resolved = resolveMenuCategoryCoverForPublicCarta(
    menuCategories.map((c) => ({
      id: c.id,
      cover_articulo_id: c.cover_articulo_id ?? null,
      cover_photo_url: c.cover_photo_url ?? null,
      cover_photo_scale: c.cover_photo_scale ?? null,
    })),
    items
  )
  const split = splitMenuCategoryCovers(resolved)

  return {
    ok: true,
    data: {
      items,
      menuCategories: menuCatalog,
      categoryCoverById: split.categoryCoverById,
      categoryCoverScaleById: split.categoryCoverScaleById,
    },
  }
}
