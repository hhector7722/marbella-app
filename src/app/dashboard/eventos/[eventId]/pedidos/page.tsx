import { createClient } from '@/utils/supabase/server'
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import { Notice } from '@/components/ui/Notice'
import PedidosEventoClient, { type EventOrderRow, type EventRow } from './PedidosEventoClient'
import { canManageEventos, canViewEventos } from '../../roles'

function PedidosError({ subtitle, message }: { subtitle: string; message: string }) {
  return (
    <DashboardDetailLayout title="Pedidos" subtitle={subtitle}>
      <Notice instance="eventos-pedido-error" variant="negative" title={subtitle}>
        {message}
      </Notice>
    </DashboardDetailLayout>
  )
}

export default async function PedidosEventoPage(props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params
  const supabase = await createClient()

  const {
    data: { session },
    error: sessErr,
  } = await supabase.auth.getSession()

  if (sessErr) {
    return <PedidosError subtitle="Error de autenticación" message={`No se pudo leer la sesión: ${sessErr.message}`} />
  }

  const user = session?.user ?? null
  if (!user) {
    return <PedidosError subtitle="Requiere login" message="No autenticado." />
  }

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (profileErr) {
    return <PedidosError subtitle="Error de permisos" message={`Error leyendo perfil: ${profileErr.message}`} />
  }

  const role = (profile as { role?: string } | null)?.role ?? null
  if (!canViewEventos(role)) {
    return <PedidosError subtitle="Acceso restringido" message="Sin permiso para ver pedidos del evento." />
  }

  const canManage = canManageEventos(role)

  const id = String(eventId ?? '').trim()
  if (!id) {
    return <PedidosError subtitle="Evento inválido" message="ID inválido." />
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
    return <PedidosError subtitle="No encontrado" message="Evento no encontrado." />
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
      <PedidosEventoClient event={ev} orders={rows} canManage={canManage} />
    </DashboardDetailLayout>
  )
}
