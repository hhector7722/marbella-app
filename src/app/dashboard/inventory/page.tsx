import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/utils/supabase/server'
import { isMasterDashboardUser } from '@/lib/master-dashboard'
import { MASTER_VIEW_AS_COOKIE } from '@/lib/master-view-as'
import { InventoryClient, type ManagerIngredientRow } from './InventoryClient'
import { InventoryPageShell } from './InventoryPageShell'
import { listPendingInventoryCounts } from './actions'

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

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, email')
    .eq('id', user.id)
    .maybeSingle()

  let effectiveRole = profile?.role ?? 'staff'
  let effectiveUserId = user.id

  // El recuento respeta el modo experiencia: ver-como un trabajador muestra su
  // versión de la pantalla, no la de gerencia.
  if (isMasterDashboardUser(user.email ?? '')) {
    const cookieStore = await cookies()
    const viewAsId = cookieStore.get(MASTER_VIEW_AS_COOKIE)?.value?.trim() || null

    if (viewAsId && viewAsId !== user.id) {
      const { data: viewedProfile } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', viewAsId)
        .maybeSingle()

      if (viewedProfile) {
        effectiveRole = viewedProfile.role ?? 'staff'
        effectiveUserId = viewedProfile.id
      }
    }
  }

  const canEditInventoryList = effectiveRole === 'manager' || effectiveRole === 'admin'

  if (canEditInventoryList) {
    const { data: allRows, error } = await supabase
      .from('ingredients')
      .select(SELECT_FIELDS)
      .is('archived_at', null)
      .order('category', { ascending: true })
      .order('name', { ascending: true })

    if (error) {
      throw new Error('Fallo al cargar la base de inventario')
    }

    const managerFullList = (allRows ?? []).map((row) => toManagerRow(row as Record<string, unknown>))
    const visibleForGrid = managerFullList.filter((r) => r.inventory_visible)
    const initialPending = await listPendingInventoryCounts()

    return (
      <InventoryPageShell
        userId={effectiveUserId}
        visibleIngredients={visibleForGrid}
        managerFullList={managerFullList}
        managerEmptyHint={visibleForGrid.length === 0}
        initialPending={initialPending}
      />
    )
  }

  const { data: ingredients, error } = await supabase
    .from('ingredients')
    .select(SELECT_FIELDS)
    .eq('inventory_visible', true)
    .is('archived_at', null)
    .order('category', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    throw new Error('Fallo al cargar la base de inventario')
  }

  return <InventoryClient initialIngredients={ingredients ?? []} userId={effectiveUserId} />
}
