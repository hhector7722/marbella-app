import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { V2PageShell, type BreadcrumbItem } from '@/components/layout-v2'
import { LoadingBlock, PageHeader } from '@/components/mds'
import DashboardSwitcher from '@/components/dashboards/DashboardSwitcher'

export const dynamic = 'force-dynamic'

const BREADCRUMBS: BreadcrumbItem[] = [
  { id: 'staff', label: 'Staff', href: '/staff/dashboard' },
  { id: 'inicio', label: 'Inicio' },
]

function roleLabelOf(role: string | null): string {
  if (role === 'admin') return 'Admin'
  if (role === 'manager') return 'Manager'
  if (role === 'supervisor') return 'Supervisor'
  if (role === 'chef') return 'Chef'
  if (role === 'staff') return 'Staff'
  return 'Staff'
}

export default async function StaffDashboardPage() {
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

  const email = profile?.email ?? user.email ?? ''
  const role = profile?.role || 'staff'
  const roleLabel = roleLabelOf(role)

  return (
    <V2PageShell
      variant="staff"
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
        description="Hub operativo Staff"
      />
      <Suspense fallback={<LoadingBlock className="mx-auto w-full max-w-sm py-16" />}>
        <DashboardSwitcher
          userRole={role}
          userEmail={email}
          initialView="staff"
        />
      </Suspense>
    </V2PageShell>
  )
}
