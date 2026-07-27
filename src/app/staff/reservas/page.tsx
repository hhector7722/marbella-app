import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { V2PageShell, type BreadcrumbItem } from '@/components/layout-v2'
import { LoadingBlock } from '@/components/mds'
import ReservasClient from './ReservasClient'

export const dynamic = 'force-dynamic'

const BREADCRUMBS: BreadcrumbItem[] = [
  { id: 'staff', label: 'Staff', href: '/staff/dashboard' },
  { id: 'reservas', label: 'Reservas y encargos' },
]

function roleLabelOf(role: string | null): string {
  if (role === 'admin') return 'Admin'
  if (role === 'manager') return 'Manager'
  if (role === 'supervisor') return 'Supervisor'
  if (role === 'chef') return 'Chef'
  if (role === 'staff') return 'Staff'
  return 'Staff'
}

export default async function ReservasPage() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user ?? null

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name, email')
    .eq('id', user.id)
    .maybeSingle()

  const role = profile?.role ?? null
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
      <Suspense fallback={<LoadingBlock className="mx-auto w-full max-w-sm py-16" />}>
        <ReservasClient />
      </Suspense>
    </V2PageShell>
  )
}
