import { createClient } from '@/utils/supabase/server'
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import { InventoryClient } from './InventoryClient'

export const dynamic = 'force-dynamic'

export default async function InventoryPage() {
  const supabase = await createClient()

  const { data: ingredients, error } = await supabase
    .from('ingredients')
    .select('id, name, unit, stock_current, category, image_url, order_unit')
    .order('category', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    throw new Error('Fallo al cargar la base de inventario')
  }

  return (
    <DashboardDetailLayout
      title="Inventario"
      subtitle="Recuento físico: solo se registrarán las diferencias frente al stock teórico"
      maxWidthClass="max-w-7xl"
      className="pt-6 md:pt-8"
    >
      <InventoryClient initialIngredients={ingredients || []} />
    </DashboardDetailLayout>
  )
}
