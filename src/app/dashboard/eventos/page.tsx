import { createClient } from '@/utils/supabase/server'
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import EventosAdminClient, { type AdminEventRow } from './EventosAdminClient'
import { canManageEventos, canViewEventos } from './roles'

export default async function EventosAdminPage() {
  const supabase = await createClient()

  const {
    data: { session },
    error: sessErr,
  } = await supabase.auth.getSession()

  if (sessErr) {
    return (
      <DashboardDetailLayout title="Encargos" subtitle="Error de autenticación">
        <div className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-red-700">No se pudo leer la sesión: {sessErr.message}</p>
        </div>
      </DashboardDetailLayout>
    )
  }

  const user = session?.user ?? null
  if (!user) {
    return (
      <DashboardDetailLayout title="Encargos" subtitle="Requiere login">
        <div className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-red-700">No autenticado.</p>
        </div>
      </DashboardDetailLayout>
    )
  }

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileErr) {
    return (
      <DashboardDetailLayout title="Encargos" subtitle="Error de permisos">
        <div className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-red-700">Error leyendo perfil: {profileErr.message}</p>
        </div>
      </DashboardDetailLayout>
    )
  }

  const role = (profile as { role?: string } | null)?.role ?? null
  if (!canViewEventos(role)) {
    return (
      <DashboardDetailLayout title="Encargos" subtitle="Acceso restringido">
        <div className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-red-700">Sin permiso para ver encargos.</p>
        </div>
      </DashboardDetailLayout>
    )
  }

  const canManage = canManageEventos(role)

  const { data: events, error: evErr } = await supabase
    .from('events')
    .select('id, slug, name, event_date, event_time, guest_count, is_active, created_at')
    .order('event_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500)

  if (evErr) {
    return (
      <DashboardDetailLayout title="Encargos" subtitle="Error de datos">
        <div className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-red-700">Error cargando encargos: {evErr.message}</p>
        </div>
      </DashboardDetailLayout>
    )
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
