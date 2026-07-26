import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import AppInstallStatusClient from '@/components/dashboard/AppInstallStatusClient'
import { V2PageShell, type BreadcrumbItem } from '@/components/layout-v2'

const BREADCRUMBS: BreadcrumbItem[] = [
  { id: 'master', label: 'Master', href: '/master/dashboard' },
  { id: 'uso', label: 'Uso', href: '/dashboard/uso' },
  { id: 'instalacion', label: 'Instalación app' },
]

export default async function AppInstallStatusPage() {
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
    .select('role, first_name, email')
    .eq('id', user.id)
    .maybeSingle()

  const role = profile?.role
  if (role !== 'manager' && role !== 'admin') {
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
        roleLabel: role === 'admin' ? 'Admin' : 'Manager',
      }}
    >
      <AppInstallStatusClient />
    </V2PageShell>
  )
}
