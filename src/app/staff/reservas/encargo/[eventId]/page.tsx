import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { V2PageShell, type BreadcrumbItem } from '@/components/layout-v2'
import { Alert, PageHeader } from '@/components/mds'
import { loadEncargoPageById } from '@/lib/load-event-encargo-page'
import { canCreateEncargo } from '@/app/dashboard/eventos/roles'
import StaffEncargoPageClient from './StaffEncargoPageClient'

export const dynamic = 'force-dynamic'

const BREADCRUMBS: BreadcrumbItem[] = [
  { id: 'staff', label: 'Staff', href: '/staff/dashboard' },
  { id: 'reservas', label: 'Reservas y encargos', href: '/staff/reservas' },
  { id: 'encargo', label: 'Encargo' },
]

function roleLabelOf(role: string | null): string {
  if (role === 'admin') return 'Admin'
  if (role === 'manager') return 'Manager'
  if (role === 'supervisor') return 'Supervisor'
  if (role === 'chef') return 'Chef'
  if (role === 'staff') return 'Staff'
  return 'Staff'
}

function ErrorView({
  message,
  user,
}: {
  message: string
  user: {
    id: string
    name: string
    email?: string
    roleLabel: string
  }
}) {
  return (
    <V2PageShell variant="staff" breadcrumbs={BREADCRUMBS} user={user}>
      <PageHeader title="Encargo" description="Gestión del pedido" />
      <Alert tone="danger" title={message} />
    </V2PageShell>
  )
}

export default async function StaffEncargoPage(props: {
  params: Promise<{ eventId: string }>
}) {
  const { eventId } = await props.params
  const supabase = await createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name, email')
    .eq('id', session.user.id)
    .maybeSingle()

  const role = (profile as { role?: string } | null)?.role ?? null
  const roleLabel = roleLabelOf(role)
  const shellUser = {
    id: session.user.id,
    name: profile?.first_name?.trim() || roleLabel,
    email: profile?.email ?? session.user.email ?? undefined,
    roleLabel,
  }

  if (!canCreateEncargo(role)) {
    return (
      <ErrorView message="Sin permiso para gestionar encargos." user={shellUser} />
    )
  }

  const loaded = await loadEncargoPageById(supabase, eventId)
  if (!loaded.ok) return <ErrorView message={loaded.message} user={shellUser} />

  const { data: orders } = await supabase
    .from('event_orders')
    .select('id, items, status, created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  const orderRows = (orders ?? []) as Array<{
    id: string
    items: unknown
    status: string
    created_at: string
  }>

  const primaryOrder =
    orderRows.find((o) => o.status === 'confirmed') ?? orderRows[0] ?? null

  return (
    <V2PageShell variant="staff" breadcrumbs={BREADCRUMBS} user={shellUser}>
      <StaffEncargoPageClient
        event={loaded.data.event}
        orderId={primaryOrder?.id ?? null}
        initialItems={primaryOrder?.items ?? []}
      />
    </V2PageShell>
  )
}
