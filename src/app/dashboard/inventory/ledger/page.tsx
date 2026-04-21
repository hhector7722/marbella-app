import Link from 'next/link'
import { BookOpen } from 'lucide-react'
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
      className="pt-6 md:pt-8"
      rightSlot={
        <Link
          href="/dashboard/recetas-tpv"
          className="min-h-[48px] px-4 rounded-xl bg-white/15 hover:bg-white/25 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-2 transition-colors"
        >
          <BookOpen className="w-5 h-5 shrink-0" strokeWidth={2.5} />
          Mapeo TPV
        </Link>
      }
    >
      <LedgerClient ingredients={ingredients || []} />
    </DashboardDetailLayout>
  )
}
