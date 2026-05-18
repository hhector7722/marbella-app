import { createClient } from '@/utils/supabase/server'
import { PublicCarta, type PublicMenuRow } from '@/components/public/PublicCarta'
import { resolveMenuCategoryCoverById, splitMenuCategoryCovers } from '@/lib/carta-category-covers'
import {
  CARTA_PUBLIC_MENU_COLUMNS,
  CARTA_PUBLIC_MENU_COLUMNS_WITH_SCALE,
  isCartaPhotoScaleColumnError,
} from '@/lib/carta-menu-select'

export const dynamic = 'force-dynamic'

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

export default async function PublicCartaPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let cartaEditHref: string | null = null
  let backHref: string | null = null
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = (profile?.role ?? null) as string | null
    backHref = role === 'manager' || role === 'admin' ? '/dashboard' : '/staff/dashboard'
    if (role === 'manager' || role === 'admin') {
      cartaEditHref = '/dashboard/carta'
    } else if (role === 'supervisor') {
      cartaEditHref = '/staff/carta'
    }
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

  let categoryCoverById: Record<string, string | null> = {}
  let categoryCoverScaleById: Record<string, 's' | 'm' | 'l'> = {}
  try {
    const resolved = await resolveMenuCategoryCoverById(
      supabase,
      menuCategories.map((c) => ({
        id: c.id,
        cover_articulo_id: c.cover_articulo_id ?? null,
        cover_photo_url: c.cover_photo_url ?? null,
        cover_photo_scale: c.cover_photo_scale ?? null,
      }))
    )
    const split = splitMenuCategoryCovers(resolved)
    categoryCoverById = split.categoryCoverById
    categoryCoverScaleById = split.categoryCoverScaleById
  } catch (e) {
    console.error('resolveMenuCategoryCoverById (carta):', e)
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

  if (error) {
    return (
      <main className="min-h-screen bg-white px-5 py-8">
        <div className="mx-auto w-full max-w-3xl rounded-2xl border border-red-200/80 bg-red-50/90 p-5 shadow-none">
          <p className="text-sm font-black uppercase tracking-widest text-red-800">No se pudo cargar la carta</p>
          <p className="mt-2 font-mono text-xs text-red-700">{error.message}</p>
        </div>
      </main>
    )
  }

  return (
    <PublicCarta
      items={(data ?? []) as unknown as PublicMenuRow[]}
      menuCategories={menuCategories.map((c) => ({
        id: c.id,
        name: c.name,
        parent_id: c.parent_id,
        sort_order: c.sort_order,
        slug: c.slug ?? null,
      }))}
      categoryCoverById={categoryCoverById}
      categoryCoverScaleById={categoryCoverScaleById}
      backHref={backHref}
      cartaEditHref={cartaEditHref}
    />
  )
}
