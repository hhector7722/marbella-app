import { createClient } from '@/utils/supabase/server'
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import PedidosEventoClient, { type EventOrderRow, type EventRow } from './PedidosEventoClient'

function isManagerRole(role: string | null): boolean {
  return role === 'manager' || role === 'admin'
}

export default async function PedidosEventoPage(props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params
  const supabase = await createClient()

  const {
    data: { session },
    error: sessErr,
  } = await supabase.auth.getSession()

  if (sessErr) {
    return (
      <DashboardDetailLayout title="Pedidos" subtitle="Error de autenticación">
        <div className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-red-700">No se pudo leer la sesión: {sessErr.message}</p>
        </div>
      </DashboardDetailLayout>
    )
  }

  const user = session?.user ?? null
  if (!user) {
    return (
      <DashboardDetailLayout title="Pedidos" subtitle="Requiere login">
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
      <DashboardDetailLayout title="Pedidos" subtitle="Error de permisos">
        <div className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-red-700">Error leyendo perfil: {profileErr.message}</p>
        </div>
      </DashboardDetailLayout>
    )
  }

  const role = (profile as any)?.role ?? null
  if (!isManagerRole(role)) {
    return (
      <DashboardDetailLayout title="Pedidos" subtitle="Acceso restringido">
        <div className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-red-700">Sin permiso. Solo manager/admin.</p>
        </div>
      </DashboardDetailLayout>
    )
  }

  const id = String(eventId ?? '').trim()
  if (!id) {
    return (
      <DashboardDetailLayout title="Pedidos" subtitle="Evento inválido">
        <div className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-red-700">ID inválido.</p>
        </div>
      </DashboardDetailLayout>
    )
  }

  const [{ data: event, error: evErr }, { data: orders, error: oErr }] = await Promise.all([
    supabase.from('events').select('id, slug, name, event_date, event_time, is_active').eq('id', id).maybeSingle(),
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
      <DashboardDetailLayout title="Pedidos" subtitle="No encontrado">
        <div className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-red-700">Evento no encontrado.</p>
        </div>
      </DashboardDetailLayout>
    )
  }

  const ev: EventRow = {
    id: String((event as any).id),
    slug: String((event as any).slug),
    name: String((event as any).name),
    event_date: String((event as any).event_date),
    event_time: String((event as any).event_time),
    is_active: Boolean((event as any).is_active),
  }

  const rows: EventOrderRow[] = ((orders ?? []) as any[]).map((r) => ({
    id: String(r.id),
    event_id: String(r.event_id),
    responsible_name: String(r.responsible_name ?? ''),
    items: (r.items ?? []) as any,
    total_amount: r.total_amount == null ? null : Number(r.total_amount),
    status: String(r.status ?? 'pending') as any,
    notes: r.notes == null ? null : String(r.notes),
    created_at: String(r.created_at),
  }))

  return (
    <DashboardDetailLayout
      title="Pedidos"
      subtitle={`${ev.name} · ${ev.event_date} · ${String(ev.event_time).slice(0, 5)}h`}
      maxWidthClass="max-w-7xl"
      backHref="/dashboard/eventos"
    >
      <PedidosEventoClient event={ev} orders={rows} />
    </DashboardDetailLayout>
  )
}

