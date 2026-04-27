import { createClient } from '@/utils/supabase/server'
import { PublicCarta, type PublicMenuRow } from '@/components/public/PublicCarta'

export const dynamic = 'force-dynamic'

export default async function PublicCartaPage() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('v_public_menu_items')
    .select(
      'articulo_id, carta_nombre, carta_nombre_es, carta_nombre_ca, carta_nombre_en, precio, photo_url, category_parent_id, category_parent_name, category_parent_sort_order, category_child_id, category_child_name, category_child_sort_order, sort_order'
    )
    .order('category_parent_sort_order', { ascending: true, nullsFirst: false })
    .order('category_parent_name', { ascending: true, nullsFirst: false })
    .order('category_child_sort_order', { ascending: true, nullsFirst: false })
    .order('category_child_name', { ascending: true, nullsFirst: false })
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('carta_nombre', { ascending: true })

  if (error) {
    return (
      <main className="min-h-screen bg-white px-4 py-8">
        <div className="mx-auto w-full max-w-2xl rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <p className="text-sm font-black uppercase tracking-widest text-red-800">No se pudo cargar la carta</p>
          <p className="mt-2 font-mono text-xs text-red-700">{error.message}</p>
        </div>
      </main>
    )
  }

  return <PublicCarta items={(data ?? []) as PublicMenuRow[]} />
}

