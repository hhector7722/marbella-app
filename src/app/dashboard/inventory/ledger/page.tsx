import { createClient } from '@/utils/supabase/server'
import { LedgerClient } from './LedgerClient'

export const dynamic = 'force-dynamic'

export default async function LedgerPage() {
  const supabase = await createClient()

  const { data: ingredients, error } = await supabase
    .from('ingredients')
    .select('id, name, unit, stock_current, category')
    .order('category', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw new Error('Fallo al cargar base de inventario')

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-6">
      <header className="flex flex-col gap-1 bg-white p-6 rounded-2xl shadow-sm border border-zinc-100">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Auditoría de Ledger</h1>
        <p className="text-sm text-gray-500">Traza inmutable de cada gramo/unidad que entra y sale del local.</p>
      </header>

      <LedgerClient ingredients={ingredients || []} />
    </main>
  )
}
