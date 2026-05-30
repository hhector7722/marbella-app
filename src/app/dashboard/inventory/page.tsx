import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import { InventoryClient, type ManagerIngredientRow } from './InventoryClient'
import { InventoryPageShell } from './InventoryPageShell'

export const dynamic = 'force-dynamic'

const SELECT_FIELDS =
  'id, name, unit, stock_current, category, image_url, order_unit, inventory_visible'

function toManagerRow(row: Record<string, unknown>): ManagerIngredientRow {
  return {
    id: row.id as string,
    name: row.name as string,
    unit: row.unit as string,
    stock_current: Number(row.stock_current),
    category: (row.category as string) ?? '',
    image_url: (row.image_url as string | null) ?? null,
    order_unit: (row.order_unit as string | null) ?? null,
    inventory_visible: row.inventory_visible !== false,
  }
}

export default async function InventoryPage() {
  const supabase = await createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user ?? null

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

    const managerFullList = (allRows ?? []).map((row) => toManagerRow(row as Record<string, unknown>))
    const visibleForGrid = managerFullList.filter((r) => r.inventory_visible)

    return (
      <InventoryPageShell
        visibleIngredients={visibleForGrid}
        managerFullList={managerFullList}
        managerEmptyHint={visibleForGrid.length === 0}
      />
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
