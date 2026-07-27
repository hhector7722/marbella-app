import { createClient } from '@/utils/supabase/server'
import { V2PageShell, type BreadcrumbItem, type UserSummary } from '@/components/layout-v2'
import { Alert, PageHeader } from '@/components/mds'
import PedidosTodosClient, { type PedidoConEncargo } from './PedidosTodosClient'
import { canViewEventos } from '../roles'

export const dynamic = 'force-dynamic'

const BREADCRUMBS: BreadcrumbItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/dashboard' },
  { id: 'eventos', label: 'Encargos', href: '/dashboard/eventos' },
  { id: 'pedidos', label: 'Pedidos' },
]

const FALLBACK_USER: UserSummary = {
  id: 'anonymous',
  name: 'Sesión',
  roleLabel: '—',
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
}: {
  title: string
  description: string
  message: string
  user?: UserSummary
}) {
  return (
    <V2PageShell variant="manager" breadcrumbs={BREADCRUMBS} user={user}>
      <PageHeader title={title} description={description} />
      <Alert tone="danger" title={message} />
    </V2PageShell>
  )
}

export default async function PedidosTodosPage() {
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
        message="Sin permiso para ver pedidos."
        user={shellUser}
      />
    )
  }

  const { data: orders, error: oErr } = await supabase
    .from('event_orders')
    .select(
      'id, event_id, responsible_name, items, total_amount, status, notes, created_at, events ( name, slug, event_date )'
    )
    .order('created_at', { ascending: false })
    .limit(500)

  if (oErr) {
    return (
      <ErrorView
        title="Pedidos"
        description="Error de datos"
        message={`Error cargando pedidos: ${oErr.message}`}
        user={shellUser}
      />
    )
  }

  const rows: PedidoConEncargo[] = ((orders ?? []) as Array<Record<string, unknown>>).map((r) => {
    const ev = r.events as { name?: string; slug?: string; event_date?: string } | null
    return {
      id: String(r.id),
      event_id: String(r.event_id),
      responsible_name: String(r.responsible_name ?? ''),
      items: (r.items ?? []) as PedidoConEncargo['items'],
      total_amount: r.total_amount == null ? null : Number(r.total_amount),
      status: String(r.status ?? 'pending') as PedidoConEncargo['status'],
      notes: r.notes == null ? null : String(r.notes),
      created_at: String(r.created_at),
      event_name: String(ev?.name ?? 'Encargo'),
      event_slug: String(ev?.slug ?? ''),
      event_date: String(ev?.event_date ?? ''),
    }
  })

  return (
    <V2PageShell variant="manager" breadcrumbs={BREADCRUMBS} user={shellUser}>
      <PageHeader
        title="Pedidos de encargos"
        description="Todos los envíos recibidos, ordenados por fecha"
      />
      <PedidosTodosClient orders={rows} />
    </V2PageShell>
  )
}
