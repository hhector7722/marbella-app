import { createClient } from '@/utils/supabase/server'
import { V2PageShell, type BreadcrumbItem, type UserSummary } from '@/components/layout-v2'
import { Alert, PageHeader } from '@/components/mds'
import PedidosEventoClient, { type EventOrderRow, type EventRow } from './PedidosEventoClient'
import { canManageEventos, canViewEventos } from '../../roles'

export const dynamic = 'force-dynamic'

const FALLBACK_USER: UserSummary = {
  id: 'anonymous',
  name: 'Sesión',
  roleLabel: '—',
}

function breadcrumbsFor(eventName?: string): BreadcrumbItem[] {
  return [
    { id: 'dashboard', label: 'Dashboard', href: '/dashboard' },
    { id: 'eventos', label: 'Encargos', href: '/dashboard/eventos' },
    { id: 'pedidos', label: eventName ? `Pedidos · ${eventName}` : 'Pedidos' },
  ]
}

function roleLabelOf(role: string | null): string {
  if (role === 'admin') return 'Admin'
  if (role === 'manager') return 'Manager'
  if (role === 'supervisor') return 'Supervisor'
  if (role === 'staff') return 'Staff'
  return '—'
}

function ErrorView({
  title,
  description,
  message,
  user = FALLBACK_USER,
  eventName,
}: {
  title: string
  description: string
  message: string
  user?: UserSummary
  eventName?: string
}) {
  return (
    <V2PageShell
      variant="manager"
      breadcrumbs={breadcrumbsFor(eventName)}
      user={user}
    >
      <PageHeader title={title} description={description} />
      <Alert tone="danger" title={message} />
    </V2PageShell>
  )
}

export default async function PedidosEventoPage(props: {
  params: Promise<{ eventId: string }>
}) {
  const { eventId } = await props.params
  const supabase = await createClient()

  const {
    data: { session },
    error: sessErr,
  } = await supabase.auth.getSession()

  if (sessErr) {
    return (
      <ErrorView
        title="Pedidos"
        description="Error de autenticación"
        message={`No se pudo leer la sesión: ${sessErr.message}`}
      />
    )
  }

  const user = session?.user ?? null
  if (!user) {
    return (
      <ErrorView
        title="Pedidos"
        description="Requiere login"
        message="No autenticado."
      />
    )
  }

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('role, first_name, email')
    .eq('id', user.id)
    .maybeSingle()

  if (profileErr) {
    return (
      <ErrorView
        title="Pedidos"
        description="Error de permisos"
        message={`Error leyendo perfil: ${profileErr.message}`}
        user={{
          id: user.id,
          name: user.email ?? 'Usuario',
          email: user.email ?? undefined,
          roleLabel: '—',
        }}
      />
    )
  }

  const role = (profile as { role?: string } | null)?.role ?? null
  const shellUser: UserSummary = {
    id: user.id,
    name: profile?.first_name?.trim() || roleLabelOf(role),
    email: profile?.email ?? user.email ?? undefined,
    roleLabel: roleLabelOf(role),
  }

  if (!canViewEventos(role)) {
    return (
      <ErrorView
        title="Pedidos"
        description="Acceso restringido"
        message="Sin permiso para ver pedidos del evento."
        user={shellUser}
      />
    )
  }

  const canManage = canManageEventos(role)

  const id = String(eventId ?? '').trim()
  if (!id) {
    return (
      <ErrorView
        title="Pedidos"
        description="Evento inválido"
        message="ID inválido."
        user={shellUser}
      />
    )
  }

  const [{ data: event, error: evErr }, { data: orders, error: oErr }] = await Promise.all([
    supabase
      .from('events')
      .select('id, slug, name, event_date, event_time, is_active')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('event_orders')
      .select('id, event_id, responsible_name, items, total_amount, status, notes, created_at')
      .eq('event_id', id)
      .order('created_at', { ascending: false })
      .limit(2000),
  ])

  if (evErr) console.error('pedidos evento: events', evErr.message)
  if (oErr) console.error('pedidos evento: event_orders', oErr.message)

  if (!event) {
    return (
      <ErrorView
        title="Pedidos"
        description="No encontrado"
        message="Evento no encontrado."
        user={shellUser}
      />
    )
  }

  const ev: EventRow = {
    id: String((event as { id: unknown }).id),
    slug: String((event as { slug: unknown }).slug),
    name: String((event as { name: unknown }).name),
    event_date: String((event as { event_date: unknown }).event_date),
    event_time: String((event as { event_time: unknown }).event_time),
    is_active: Boolean((event as { is_active: unknown }).is_active),
  }

  const rows: EventOrderRow[] = (
    (orders ?? []) as Array<Record<string, unknown>>
  ).map((r) => ({
    id: String(r.id),
    event_id: String(r.event_id),
    responsible_name: String(r.responsible_name ?? ''),
    items: (r.items ?? []) as EventOrderRow['items'],
    total_amount: r.total_amount == null ? null : Number(r.total_amount),
    status: String(r.status ?? 'pending') as EventOrderRow['status'],
    notes: r.notes == null ? null : String(r.notes),
    created_at: String(r.created_at),
  }))

  return (
    <V2PageShell
      variant="manager"
      breadcrumbs={breadcrumbsFor(ev.name)}
      user={shellUser}
    >
      <PageHeader
        title="Pedidos"
        description={`${ev.name} · ${ev.event_date} · ${String(ev.event_time).slice(0, 5)}h`}
      />
      <PedidosEventoClient event={ev} orders={rows} canManage={canManage} />
    </V2PageShell>
  )
}
