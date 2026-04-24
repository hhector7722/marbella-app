import { createClient } from '@/utils/supabase/server'
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import CartaEditorClient from './CartaEditorClient'
import type { CartaEditorMappingRow, CartaOverrideRow } from './types'
import Link from 'next/link'
import { ArrowRightLeft } from 'lucide-react'

export default async function CartaDashboardPage() {
  const supabase = await createClient()

  const [{ data: mappings, error: mappingsError }, { data: overrides, error: overridesError }] =
    await Promise.all([
      supabase
        .from('map_tpv_receta')
        .select('articulo_id, recipe_id, bdp_articulos(id, nombre, familia_id, bdp_familias(nombre)), recipes(id, name, photo_url)')
        .limit(5000),
      supabase.from('digital_menu_overrides').select('*').limit(5000),
    ])

  if (mappingsError) console.error('Error fetching map_tpv_receta (carta):', mappingsError)
  if (overridesError) console.error('Error fetching digital_menu_overrides (carta):', overridesError)

  return (
    <DashboardDetailLayout
      title="Carta"
      subtitle="Ocultar, ordenar y sobrescribir nombre/descr/precio/foto (sin tocar TPV)"
      maxWidthClass="max-w-7xl"
      rightSlot={
        <Link
          href="/dashboard/recetas-tpv"
          className="h-12 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white font-black uppercase tracking-wider text-[11px] flex items-center gap-2 transition-colors min-h-[48px]"
          aria-label="Ir a Mapeo TPV"
        >
          <ArrowRightLeft size={18} strokeWidth={2.5} />
          Mapeo TPV
        </Link>
      }
    >
      <CartaEditorClient
        mappings={(mappings ?? []) as unknown as CartaEditorMappingRow[]}
        overrides={(overrides ?? []) as unknown as CartaOverrideRow[]}
      />
    </DashboardDetailLayout>
  )
}

