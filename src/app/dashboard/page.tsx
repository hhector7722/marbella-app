import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { V2PageShell, type BreadcrumbItem } from '@/components/layout-v2'
import { LoadingBlock, PageHeader } from '@/components/mds'
import DashboardSwitcher from '@/components/dashboards/DashboardSwitcher'
import { getDashboardData } from '@/app/actions/get-dashboard-data'

export const dynamic = 'force-dynamic'

const BREADCRUMBS: BreadcrumbItem[] = [
  { id: 'dashboard', label: 'Dashboard' },
]

function roleLabelOf(role: string | null): string {
  if (role === 'admin') return 'Admin'
  if (role === 'manager') return 'Manager'
  if (role === 'supervisor') return 'Supervisor'
  if (role === 'staff') return 'Staff'
  return '—'
}

/**
 * Hub manager `/dashboard`.
 * Gate: solo manager (resto → /staff/dashboard) — igual que legacy.
 * Sprint 33: shell V2 + PageHeader; DashboardSwitcher / datos intactos.
 */
export default async function AdminDashboardPage() {
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
    .select('role, email, first_name')
    .eq('id', user.id)
    .single()

  if (profile) {
    if (profile.role !== 'manager') {
      redirect('/staff/dashboard')
    }
  }

  const email = profile?.email ?? user.email ?? ''
  const role = profile?.role || 'staff'
  const roleLabel = roleLabelOf(role)

  const dashboardData = await getDashboardData()

  return (
    <V2PageShell
      variant="manager"
      breadcrumbs={BREADCRUMBS}
      user={{
        id: user.id,
        name: profile?.first_name?.trim() || roleLabel,
        email: email || undefined,
        roleLabel,
      }}
    >
      <PageHeader
        title="Inicio"
        description="Hub operativo Manager"
      />
      <Suspense fallback={<LoadingBlock className="mx-auto w-full max-w-sm py-16" />}>
        <DashboardSwitcher
          userRole={role}
          userEmail={email}
          initialView="admin"
          initialData={dashboardData}
        />
      </Suspense>
    </V2PageShell>
  )
}
