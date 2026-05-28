import { createClient } from '@/utils/supabase/server'
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import EventosAdminClient, { type AdminEventRow, type AdminMenuProductRow } from './EventosAdminClient'
import { canManageEventos, canViewEventos } from './roles'

type DefaultPackRow = { id: string; label: string; items: any }

export default async function EventosAdminPage() {
  const supabase = await createClient()

  const {
    data: { session },
    error: sessErr,
  } = await supabase.auth.getSession()

  if (sessErr) {
    return (
      <DashboardDetailLayout title="Eventos" subtitle="Error de autenticación">
        <div className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-red-700">No se pudo leer la sesión: {sessErr.message}</p>
        </div>
      </DashboardDetailLayout>
    )
  }

  const user = session?.user ?? null
  if (!user) {
    return (
      <DashboardDetailLayout title="Eventos" subtitle="Requiere login">
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
      <DashboardDetailLayout title="Eventos" subtitle="Error de permisos">
        <div className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-red-700">Error leyendo perfil: {profileErr.message}</p>
        </div>
      </DashboardDetailLayout>
    )
  }

  const role = (profile as any)?.role ?? null
  if (!canViewEventos(role)) {
    return (
      <DashboardDetailLayout title="Eventos" subtitle="Acceso restringido">
        <div className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-red-700">Sin permiso para ver encargos.</p>
        </div>
      </DashboardDetailLayout>
    )
  }

  const canManage = canManageEventos(role)

  const [{ data: menuRows, error: menuErr }, { data: epRows, error: epErr }, { data: events, error: evErr }, { data: packRow, error: packErr }] =
    await Promise.all([
      supabase
        .from('v_digital_menu_items')
        .select('articulo_id, carta_nombre, precio, category_parent_name, category_child_name')
        .order('category_parent_sort_order', { ascending: true, nullsFirst: false })
        .order('category_child_sort_order', { ascending: true, nullsFirst: false })
        .order('sort_order', { ascending: true, nullsFirst: false })
        .limit(5000),
      supabase.from('event_products').select('product_id, is_active').limit(5000),
      supabase
        .from('events')
        .select('id, slug, name, event_date, event_time, description, is_active, created_at')
        .order('event_date', { ascending: false })
        .order('event_time', { ascending: false })
        .limit(500),
      supabase.from('event_default_pack').select('id, label, items').maybeSingle(),
    ])

  if (menuErr) console.error('eventos: v_digital_menu_items', menuErr.message)
  if (epErr) console.error('eventos: event_products', epErr.message)
  if (evErr) console.error('eventos: events', evErr.message)
  if (packErr) console.error('eventos: event_default_pack', packErr.message)

  const activeByProductId = new Map<string, boolean>()
  for (const r of (epRows ?? []) as any[]) {
    const pid = String(r.product_id ?? '').trim()
    if (!pid) continue
    activeByProductId.set(pid, Boolean(r.is_active))
  }

  const products: AdminMenuProductRow[] = ((menuRows ?? []) as any[]).map((r) => {
    const articulo_id = Number(r.articulo_id)
    const productId = String(r.articulo_id)
    const parent = String(r.category_parent_name ?? '').trim()
    const child = String(r.category_child_name ?? '').trim()
    const category = [parent, child].filter(Boolean).join(' · ') || ''
    return {
      productId,
      articulo_id,
      name: String(r.carta_nombre ?? '').trim() || 'Sin nombre',
      price: Number(r.precio) || 0,
      category,
      isActive: activeByProductId.get(productId) ?? false,
    }
  })

  // Orders count per event (simple aggregation client-side)
  const eventIds = (events ?? []).map((e: any) => String(e.id))
  let orderCountByEventId = new Map<string, number>()
  if (eventIds.length > 0) {
    const { data: orderRefs, error: ocErr } = await supabase
      .from('event_orders')
      .select('event_id')
      .in('event_id', eventIds)
      .limit(20000)
    if (ocErr) {
      console.error('eventos: event_orders count', ocErr.message)
    } else {
      orderCountByEventId = new Map<string, number>()
      for (const r of (orderRefs ?? []) as any[]) {
        const eid = String(r.event_id ?? '')
        if (!eid) continue
        orderCountByEventId.set(eid, (orderCountByEventId.get(eid) ?? 0) + 1)
      }
    }
  }

  const adminEvents: AdminEventRow[] = ((events ?? []) as any[]).map((e) => ({
    id: String(e.id),
    slug: String(e.slug),
    name: String(e.name),
    event_date: String(e.event_date),
    event_time: String(e.event_time),
    description: e.description ? String(e.description) : null,
    is_active: Boolean(e.is_active),
    created_at: String(e.created_at),
    orders_count: orderCountByEventId.get(String(e.id)) ?? 0,
  }))

  const defaultPack: DefaultPackRow | null =
    packRow && (packRow as any).id
      ? {
          id: String((packRow as any).id),
          label: String((packRow as any).label ?? ''),
          items: (packRow as any).items ?? [],
        }
      : null

  return (
    <DashboardDetailLayout
      title="Encargos"
      subtitle="Crea eventos, comparte el enlace y revisa pedidos"
      maxWidthClass="max-w-7xl"
    >
      <EventosAdminClient products={products} defaultPack={defaultPack} events={adminEvents} canManage={canManage} />
    </DashboardDetailLayout>
  )
}

