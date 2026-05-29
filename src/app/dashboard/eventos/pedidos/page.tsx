import { createClient } from '@/utils/supabase/server'
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import PedidosTodosClient, { type PedidoConEncargo } from './PedidosTodosClient'
import { canViewEventos } from '../roles'

export default async function PedidosTodosPage() {
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

  const role = (profile as { role?: string } | null)?.role ?? null
  if (!canViewEventos(role)) {
    return (
      <DashboardDetailLayout title="Pedidos" subtitle="Acceso restringido">
        <div className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-red-700">Sin permiso para ver pedidos.</p>
        </div>
      </DashboardDetailLayout>
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
      <DashboardDetailLayout title="Pedidos" subtitle="Error de datos">
        <div className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-red-700">Error cargando pedidos: {oErr.message}</p>
        </div>
      </DashboardDetailLayout>
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
    <DashboardDetailLayout
      title="Pedidos de encargos"
      subtitle="Todos los envíos recibidos, ordenados por fecha"
      maxWidthClass="max-w-7xl"
      backHref="/dashboard/eventos"
    >
      <PedidosTodosClient orders={rows} />
    </DashboardDetailLayout>
  )
}
