import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { V2PageShell, type BreadcrumbItem, type UserSummary } from '@/components/layout-v2'
import { Alert, PageHeader } from '@/components/mds'
import EventosAdminClient, { type AdminEventRow } from './EventosAdminClient'
import { canManageEventos, canViewEventos } from './roles'

export const dynamic = 'force-dynamic'

const BREADCRUMBS: BreadcrumbItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/dashboard' },
  { id: 'eventos', label: 'Encargos' },
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

export default async function EventosAdminPage() {
  const supabase = await createClient()

  const {
    data: { session },
    error: sessErr,
  } = await supabase.auth.getSession()

  if (sessErr) {
    return (
      <ErrorView
        title="Encargos"
        description="Error de autenticación"
        message={`No se pudo leer la sesión: ${sessErr.message}`}
      />
    )
  }

  const user = session?.user ?? null
  if (!user) {
    return (
      <ErrorView
        title="Encargos"
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
        title="Encargos"
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
  if (role === 'staff' || role === 'supervisor') {
    redirect('/staff/reservas')
  }
  if (!canViewEventos(role)) {
    return (
      <ErrorView
        title="Encargos"
        description="Acceso restringido"
        message="Sin permiso para ver encargos."
        user={{
          id: user.id,
          name: profile?.first_name?.trim() || roleLabelOf(role),
          email: profile?.email ?? user.email ?? undefined,
          roleLabel: roleLabelOf(role),
        }}
      />
    )
  }

  const canManage = canManageEventos(role)
  const shellUser: UserSummary = {
    id: user.id,
    name: profile?.first_name?.trim() || roleLabelOf(role),
    email: profile?.email ?? user.email ?? undefined,
    roleLabel: roleLabelOf(role),
  }

  const { data: events, error: evErr } = await supabase
    .from('events')
    .select('id, slug, name, event_date, event_time, guest_count, is_active, created_at')
    .order('event_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500)

  if (evErr) {
    return (
      <ErrorView
        title="Encargos"
        description="Error de datos"
        message={`Error cargando encargos: ${evErr.message}`}
        user={shellUser}
      />
    )
  }

  const adminEvents: AdminEventRow[] = ((events ?? []) as Array<Record<string, unknown>>).map(
    (e) => ({
      id: String(e.id),
      slug: String(e.slug),
      name: String(e.name),
      event_date: String(e.event_date),
      event_time: String(e.event_time),
      guest_count: e.guest_count == null ? null : Number(e.guest_count),
      is_active: Boolean(e.is_active),
      created_at: String(e.created_at),
    })
  )

  return (
    <V2PageShell variant="manager" breadcrumbs={BREADCRUMBS} user={shellUser}>
      <PageHeader
        title="Encargos"
        description="Crea encargos, edita la carta y comparte el enlace con el cliente"
      />
      <EventosAdminClient events={adminEvents} canManage={canManage} />
    </V2PageShell>
  )
}
