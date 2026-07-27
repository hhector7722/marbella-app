import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { V2PageShell, type BreadcrumbItem } from '@/components/layout-v2'
import { LoadingBlock } from '@/components/mds'
import HistoryClient from './HistoryClient'

export const dynamic = 'force-dynamic'

const BREADCRUMBS: BreadcrumbItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/dashboard' },
  { id: 'history', label: 'Historial' },
]

function roleLabelOf(role: string | null): string {
  if (role === 'admin') return 'Admin'
  if (role === 'manager') return 'Manager'
  if (role === 'supervisor') return 'Supervisor'
  if (role === 'staff') return 'Staff'
  return '—'
}

/**
 * Historial de cierres (tabla / calendario).
 * Sin role gate extra — igual que legacy CSR (isManager solo para UI).
 * Slice XIII Personal: solo chrome; lógica y datos intactos.
 */
export default async function HistoryPage() {
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
      variant="manager"
      breadcrumbs={BREADCRUMBS}
      user={{
        id: user.id,
        name: profile?.first_name?.trim() || roleLabel,
        email: profile?.email ?? user.email ?? undefined,
        roleLabel,
      }}
    >
      <Suspense fallback={<LoadingBlock className="mx-auto w-full max-w-sm py-16" />}>
        <HistoryClient />
      </Suspense>
    </V2PageShell>
  )
}
