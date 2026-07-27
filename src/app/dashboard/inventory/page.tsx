import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { V2PageShell, type BreadcrumbItem } from '@/components/layout-v2'
import { PageHeader } from '@/components/mds'
import { InventoryClient, type ManagerIngredientRow } from './InventoryClient'
import { InventoryPageShell } from './InventoryPageShell'

export const dynamic = 'force-dynamic'

const BREADCRUMBS: BreadcrumbItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/dashboard' },
  { id: 'inventory', label: 'Inventario' },
]

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
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name, email')
    .eq('id', user.id)
    .maybeSingle()

  const role = profile?.role ?? 'staff'
  const canEditInventoryList = role === 'manager' || role === 'admin'
  const roleLabel =
    role === 'admin' ? 'Admin' : role === 'manager' ? 'Manager' : 'Staff'

  const shellUser = {
    id: user.id,
    name: profile?.first_name?.trim() || roleLabel,
    email: profile?.email ?? user.email ?? undefined,
    roleLabel,
  }

  if (canEditInventoryList) {
    const { data: allRows, error } = await supabase
      .from('ingredients')
      .select(SELECT_FIELDS)
      .order('category', { ascending: true })
      .order('name', { ascending: true })

    if (error) {
      throw new Error('Fallo al cargar la base de inventario')
    }

    const managerFullList = (allRows ?? []).map((row) =>
      toManagerRow(row as Record<string, unknown>)
    )
    const visibleForGrid = managerFullList.filter((r) => r.inventory_visible)

    return (
      <V2PageShell variant="manager" breadcrumbs={BREADCRUMBS} user={shellUser}>
        <InventoryPageShell
          visibleIngredients={visibleForGrid}
          managerFullList={managerFullList}
          managerEmptyHint={visibleForGrid.length === 0}
        />
      </V2PageShell>
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
    <V2PageShell variant="manager" breadcrumbs={BREADCRUMBS} user={shellUser}>
      <PageHeader
        title="Inventario"
        description="Conteo y ajuste de stock por ingrediente."
      />
      <InventoryClient initialIngredients={ingredients ?? []} />
    </V2PageShell>
  )
}
