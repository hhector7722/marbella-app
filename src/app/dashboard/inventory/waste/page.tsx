import { createClient } from '@/utils/supabase/server'
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import { WasteClient } from './WasteClient'

export const dynamic = 'force-dynamic'

export default async function WastePage() {
  const supabase = await createClient()

  const [ingRes, recRes] = await Promise.all([
    supabase
      .from('ingredients')
      .select('id, name, unit, category, image_url, order_unit')
      .order('category', { ascending: true })
      .order('name', { ascending: true }),
    supabase.from('recipes').select('id, name, photo_url').order('name', { ascending: true }),
  ])

  if (ingRes.error) {
    throw new Error('No se pudo cargar el catálogo de ingredientes.')
  }
  if (recRes.error) {
    throw new Error('No se pudo cargar el listado de recetas.')
  }

  return (
    <DashboardDetailLayout title="Mermas" maxWidthClass="max-w-7xl">
      <WasteClient initialIngredients={ingRes.data || []} recipes={recRes.data || []} />
    </DashboardDetailLayout>
  )
}
