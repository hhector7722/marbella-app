import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { V2PageShell, type BreadcrumbItem } from '@/components/layout-v2'
import StaffPropinasView from '@/components/tips/StaffPropinasView'
import {
  mapStaffTipHistoryRows,
  STAFF_TIP_HISTORY_SELECT,
  type TipDistributionLineRow,
} from '@/lib/staff-tip-history'

export const dynamic = 'force-dynamic'

const BREADCRUMBS: BreadcrumbItem[] = [
  { id: 'staff', label: 'Staff', href: '/staff/dashboard' },
  { id: 'propinas', label: 'Propinas' },
]

/** Vista propinas (empleado). Manager/admin entran aquí desde staff; gestión en /dashboard/propinas. */
const STAFF_PROPINAS_ROLES = new Set([
  'staff',
  'supervisor',
  'chef',
  'manager',
  'admin',
])

function roleLabelOf(role: string | null): string {
  if (role === 'admin') return 'Admin'
  if (role === 'manager') return 'Manager'
  if (role === 'supervisor') return 'Supervisor'
  if (role === 'chef') return 'Chef'
  if (role === 'staff') return 'Staff'
  return 'Staff'
}

export default async function StaffPropinasPage() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user ?? null

  if (!user) redirect('/login')

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, first_name, email')
    .eq('id', user.id)
    .single()

  if (profileError) redirect('/login')

  const role = profile?.role ?? null

  if (!role || !STAFF_PROPINAS_ROLES.has(role)) {
    redirect('/staff/dashboard')
  }

  const { data: linesRaw, error: linesError } = await supabase
    .from('tip_distribution_lines')
    .select(STAFF_TIP_HISTORY_SELECT)
    .eq('user_id', user.id)

  if (linesError) {
    console.error('[staff/propinas] history:', linesError.message)
  }

  const initialHistory = mapStaffTipHistoryRows(
    linesRaw as TipDistributionLineRow[] | null
  )

  const roleLabel = roleLabelOf(role)

  return (
    <V2PageShell
      variant="staff"
      breadcrumbs={BREADCRUMBS}
      user={{
        id: user.id,
        name: profile?.first_name?.trim() || roleLabel,
        email: profile?.email ?? user.email ?? undefined,
        roleLabel,
      }}
    >
      <StaffPropinasView
        initialHistory={initialHistory}
        viewerUserId={user.id}
        viewerEmail={user.email ?? ''}
        viewerFirstName={profile?.first_name ?? ''}
      />
    </V2PageShell>
  )
}
