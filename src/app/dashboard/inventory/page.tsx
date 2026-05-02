import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import { InventoryClient } from './InventoryClient'
import {
  InventoryManagerHeaderControls,
  type InventoryCatalogRow,
} from './InventoryManagerHeaderControls'

export const dynamic = 'force-dynamic'

const SELECT_FIELDS =
  'id, name, unit, stock_current, category, image_url, order_unit, inventory_visible'

export default async function InventoryPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()

  const role = profile?.role ?? 'staff'
  const canEditInventoryList = role === 'manager' || role === 'admin'

  if (canEditInventoryList) {
    const { data: allRows, error } = await supabase
      .from('ingredients')
      .select(SELECT_FIELDS)
      .order('category', { ascending: true })
      .order('name', { ascending: true })

    if (error) {
      throw new Error('Fallo al cargar la base de inventario')
    }

    const catalog: InventoryCatalogRow[] = (allRows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      inventory_visible: row.inventory_visible !== false,
    }))

    const visibleForGrid = (allRows ?? []).filter((row) => row.inventory_visible !== false)

    return (
      <DashboardDetailLayout
        title="Inventario"
        maxWidthClass="max-w-7xl"
        className="pt-6 md:pt-8"
        rightSlot={<InventoryManagerHeaderControls catalog={catalog} />}
      >
        <InventoryClient
          initialIngredients={visibleForGrid}
          managerEmptyHint={visibleForGrid.length === 0}
        />
      </DashboardDetailLayout>
    )
  }

  const { data: ingredients, error } = await supabase
    .from('ingredients')
    .select(SELECT_FIELDS)
    .eq('inventory_visible', true)
    .order('category', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    throw new Error('Fallo al cargar la base de inventario')
  }

  return (
    <DashboardDetailLayout title="Inventario" maxWidthClass="max-w-7xl" className="pt-6 md:pt-8">
      <InventoryClient initialIngredients={ingredients ?? []} />
    </DashboardDetailLayout>
  )
}
