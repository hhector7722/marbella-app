import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { V2PageShell, type BreadcrumbItem } from '@/components/layout-v2'
import { PageHeader } from '@/components/mds'
import { WasteClient } from './WasteClient'

export const dynamic = 'force-dynamic'

const BREADCRUMBS: BreadcrumbItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/dashboard' },
  { id: 'inventory', label: 'Inventario', href: '/dashboard/inventory' },
  { id: 'waste', label: 'Mermas' },
]

export default async function WastePage() {
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

  const [ingRes, recRes] = await Promise.all([
    supabase
      .from('ingredients')
      .select('id, name, unit, category, image_url, order_unit')
      .order('category', { ascending: true })
      .order('name', { ascending: true }),
    supabase.from('recipes').select('id, name, photo_url, category').order('name', { ascending: true }),
  ])

  if (ingRes.error) {
    throw new Error('No se pudo cargar el catálogo de ingredientes.')
  }
  if (recRes.error) {
    throw new Error('No se pudo cargar el listado de recetas.')
  }

  const role = profile?.role ?? null
  const roleLabel =
    role === 'admin' ? 'Admin' : role === 'manager' ? 'Manager' : 'Staff'

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
      <PageHeader
        title="Mermas"
        description="Registro de mermas por receta o ingrediente."
      />
      <WasteClient
        initialIngredients={ingRes.data || []}
        recipes={recRes.data || []}
      />
    </V2PageShell>
  )
}
