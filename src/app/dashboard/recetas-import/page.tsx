import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { V2PageShell, type BreadcrumbItem } from '@/components/layout-v2'
import RecetasImportClient from './RecetasImportClient'

export const dynamic = 'force-dynamic'

const BREADCRUMBS: BreadcrumbItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/dashboard' },
  { id: 'import', label: 'Importación', href: '/dashboard/import' },
  { id: 'recetas-import', label: 'Recetas IA' },
]

function roleLabelOf(role: string | null): string {
  if (role === 'admin') return 'Admin'
  if (role === 'manager') return 'Manager'
  if (role === 'supervisor') return 'Supervisor'
  if (role === 'staff') return 'Staff'
  return '—'
}

export default async function RecetasImportPage() {
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

  if (profile?.role !== 'manager' && profile?.role !== 'admin') {
    redirect('/dashboard')
  }

  const { data: allIngredients } = await supabase
    .from('ingredients')
    .select('id, name')
    .order('name')

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
      <RecetasImportClient allIngredients={allIngredients ?? []} />
    </V2PageShell>
  )
}
