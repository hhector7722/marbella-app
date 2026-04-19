import { createClient } from '@/utils/supabase/server'
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import { WasteClient } from './WasteClient'

export const dynamic = 'force-dynamic'

export default async function WastePage() {
  const supabase = await createClient()

  const { data: ingredients, error } = await supabase
    .from('ingredients')
    .select('id, name, unit, stock_current, category')
    .order('category', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    throw new Error('No se pudo cargar el catálogo de ingredientes.')
  }

  return (
    <DashboardDetailLayout
      title="Mermas"
      subtitle="Registro de pérdidas y consumos no facturados"
      maxWidthClass="max-w-4xl"
    >
      <WasteClient initialIngredients={ingredients || []} />
    </DashboardDetailLayout>
  )
}
