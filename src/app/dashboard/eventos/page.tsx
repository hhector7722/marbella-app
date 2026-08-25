import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import { Notice } from '@/components/ui/Notice'
import EventosAdminClient, { type AdminEventRow } from './EventosAdminClient'
import { canManageEventos, canViewEventos } from './roles'

function EncargosError({ subtitle, message }: { subtitle: string; message: string }) {
  return (
    <DashboardDetailLayout title="Encargos" subtitle={subtitle}>
      <Notice instance="eventos-admin-error" variant="negative" title={subtitle}>
        {message}
      </Notice>
    </DashboardDetailLayout>
  )
}

export default async function EventosAdminPage() {
  const supabase = await createClient()

  const {
    data: { session },
    error: sessErr,
  } = await supabase.auth.getSession()

  if (sessErr) {
    return <EncargosError subtitle="Error de autenticación" message={`No se pudo leer la sesión: ${sessErr.message}`} />
  }

  const user = session?.user ?? null
  if (!user) {
    return <EncargosError subtitle="Requiere login" message="No autenticado." />
  }

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileErr) {
    return <EncargosError subtitle="Error de permisos" message={`Error leyendo perfil: ${profileErr.message}`} />
  }

  const role = (profile as { role?: string } | null)?.role ?? null
  if (role === 'staff' || role === 'supervisor') {
    redirect('/staff/reservas')
  }
  if (!canViewEventos(role)) {
    return <EncargosError subtitle="Acceso restringido" message="Sin permiso para ver encargos." />
  }

  const canManage = canManageEventos(role)

  const { data: events, error: evErr } = await supabase
    .from('events')
    .select('id, slug, name, event_date, event_time, guest_count, is_active, created_at')
    .order('event_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500)

  if (evErr) {
    return <EncargosError subtitle="Error de datos" message={`Error cargando encargos: ${evErr.message}`} />
  }

  const adminEvents: AdminEventRow[] = ((events ?? []) as Array<Record<string, unknown>>).map((e) => ({
    id: String(e.id),
    slug: String(e.slug),
    name: String(e.name),
    event_date: String(e.event_date),
    event_time: String(e.event_time),
    guest_count: e.guest_count == null ? null : Number(e.guest_count),
    is_active: Boolean(e.is_active),
    created_at: String(e.created_at),
  }))

  return (
    <DashboardDetailLayout
      title="Encargos"
      subtitle="Crea encargos, edita la carta y comparte el enlace con el cliente"
      maxWidthClass="max-w-3xl"
    >
      <EventosAdminClient events={adminEvents} canManage={canManage} />
    </DashboardDetailLayout>
  )
}
