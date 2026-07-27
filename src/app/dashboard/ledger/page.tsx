import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { V2PageShell, type BreadcrumbItem } from '@/components/layout-v2'
import ManagerLedgerView from '@/components/ledger/ManagerLedgerView'

export const dynamic = 'force-dynamic'

const BREADCRUMBS: BreadcrumbItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/dashboard' },
  { id: 'ledger', label: 'Libro mayor' },
]

/**
 * Libro mayor del manager. Gate estricto: solo role === 'manager'
 * (igual que legacy; admin no entra por esta ruta).
 */
export default async function LedgerPage() {
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
    .single()

  if (profile?.role !== 'manager') {
    redirect('/dashboard')
  }

  return (
    <V2PageShell
      variant="manager"
      breadcrumbs={BREADCRUMBS}
      user={{
        id: user.id,
        name: profile?.first_name?.trim() || 'Manager',
        email: profile?.email ?? user.email ?? undefined,
        roleLabel: 'Manager',
      }}
    >
      <ManagerLedgerView />
    </V2PageShell>
  )
}
