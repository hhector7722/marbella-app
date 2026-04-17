import { createClient } from '@/utils/supabase/server'
import { InventoryClient } from './InventoryClient'

export const dynamic = 'force-dynamic'

export default async function InventoryPage() {
  const supabase = await createClient()

  const { data: ingredients, error } = await supabase
    .from('ingredients')
    .select('id, name, unit, stock_current, category')
    .order('category', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    throw new Error('Fallo al cargar la base de inventario')
  }

  return (
    <main className="max-w-4xl mx-auto p-4 space-y-6">
      <header className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Recuento de Inventario</h1>
          <p className="text-sm text-gray-500 mt-1">Ajuste físico frente a teórico. Solo se registrarán las diferencias.</p>
        </div>
      </header>
      <InventoryClient initialIngredients={ingredients || []} />
    </main>
  )
}
