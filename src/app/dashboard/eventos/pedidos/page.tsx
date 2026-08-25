import { createClient } from '@/utils/supabase/server'
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import { Notice } from '@/components/ui/Notice'
import PedidosTodosClient, { type PedidoConEncargo } from './PedidosTodosClient'
import { canViewEventos } from '../roles'

function PedidosError({ subtitle, message }: { subtitle: string; message: string }) {
  return (
    <DashboardDetailLayout title="Pedidos" subtitle={subtitle}>
      <Notice instance="eventos-pedidos-error" variant="negative" title={subtitle}>
        {message}
      </Notice>
    </DashboardDetailLayout>
  )
}

export default async function PedidosTodosPage() {
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
    return <PedidosError subtitle="Acceso restringido" message="Sin permiso para ver pedidos." />
  }

  const { data: orders, error: oErr } = await supabase
    .from('event_orders')
    .select(
      'id, event_id, responsible_name, items, total_amount, status, notes, created_at, events ( name, slug, event_date )'
    )
    .order('created_at', { ascending: false })
    .limit(500)

  if (oErr) {
    return <PedidosError subtitle="Error de datos" message={`Error cargando pedidos: ${oErr.message}`} />
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
