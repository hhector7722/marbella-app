import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import { LedgerClient } from './LedgerClient'

export const dynamic = 'force-dynamic'

export default async function LedgerPage() {
  const supabase = await createClient()

  const { data: ingredients, error } = await supabase
    .from('ingredients')
    .select('id, name, unit, stock_current, category, image_url, order_unit')
    .order('category', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw new Error('Fallo al cargar base de inventario')

  return (
    <DashboardDetailLayout
      title="Stock"
      subtitle="Historial de movimientos y trazabilidad por ingrediente"
      maxWidthClass="max-w-7xl"
      rightSlot={
        <Link
          href="/dashboard/recetas-tpv"
          className="shrink-0 text-[11px] font-black text-white uppercase tracking-widest hover:text-white/80 transition-colors min-h-[48px] flex items-center"
        >
          Mapeo TPV
        </Link>
      }
    >
      <LedgerClient ingredients={ingredients || []} />
    </DashboardDetailLayout>
  )
}
