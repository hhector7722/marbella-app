import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { V2PageShell, type BreadcrumbItem } from '@/components/layout-v2'
import { PageHeader } from '@/components/mds'
import { isMasterDashboardUser } from '@/lib/master-dashboard'
import GestionClient from './GestionClient'

export const dynamic = 'force-dynamic'

const BREADCRUMBS: BreadcrumbItem[] = [
  { id: 'staff', label: 'Staff', href: '/staff/dashboard' },
  { id: 'actividades', label: 'Actividades', href: '/staff/actividades' },
  { id: 'gestion', label: 'Gestión' },
]

function roleLabelOf(role: string | null): string {
  if (role === 'admin') return 'Admin'
  if (role === 'manager') return 'Manager'
  if (role === 'supervisor') return 'Supervisor'
  if (role === 'chef') return 'Chef'
  if (role === 'staff') return 'Staff'
  return 'Staff'
}

export default async function GestionActividadesPage() {
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

  const email = profile?.email ?? user.email ?? ''
  if (!isMasterDashboardUser(email)) {
    redirect('/staff/actividades')
  }

  const role = profile?.role ?? null
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
        title="Gestión de actividades"
        description="Catálogo, colores, unificación y estado activo."
      />
      <GestionClient />
    </V2PageShell>
  )
}
