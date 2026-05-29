import { createClient } from '@/utils/supabase/server'
import EventEncargoCartaClient from './EventEncargoCartaClient'
import { formatYmdInMadrid } from '@/lib/madrid-date-bounds'
import { loadEventCartaMenu } from '@/lib/load-event-carta-menu'
import { canManageEventos } from '@/app/dashboard/eventos/roles'
import {
  isEventProductEnabled,
  parseEnabledProductIds,
  parseEventCategoryLimits,
} from '@/lib/event-encargo-config'
import { eventOrderProductId } from '@/lib/event-order-carta'

function parseTimeHm(time: string): { hh: number; mm: number } | null {
  const m = String(time ?? '')
    .trim()
    .match(/^(\d{2}):(\d{2})/)
  if (!m) return null
  return { hh: Number(m[1]), mm: Number(m[2]) }
}

function madridNowHm(): { hh: number; mm: number } {
  const fmt = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(new Date())
  const hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') || 0
  const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0') || 0
  return { hh, mm }
}

function isPastInMadrid(eventDateYmd: string, eventTime: string): boolean {
  const today = formatYmdInMadrid(new Date())
  if (eventDateYmd < today) return true
  if (eventDateYmd > today) return false
  const evHm = parseTimeHm(eventTime)
  if (!evHm) return false
  const nowHm = madridNowHm()
  if (evHm.hh < nowHm.hh) return true
  if (evHm.hh > nowHm.hh) return false
  return evHm.mm < nowHm.mm
}

function ErrorView({ message }: { message: string }) {
  return (
    <main className="flex min-h-[100dvh] flex-col bg-white text-zinc-900">
      <div className="mx-auto w-full max-w-2xl px-5 pb-safe pt-safe md:px-8">
        <div className="mt-6 rounded-xl border border-zinc-100 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-widest text-[#36606F]">Encargo</p>
          <p className="mt-2 text-sm font-bold text-zinc-900">{message}</p>
        </div>
      </div>
    </main>
  )
}

export default async function EventoPublicPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params
  const supabase = await createClient()

  const s = String(slug ?? '').trim()
  if (!s) return <ErrorView message="Encargo no válido." />

  const { data: event, error: evErr } = await supabase
    .from('events')
    .select(
      'id, slug, name, event_date, event_time, pack_items, enabled_product_ids, category_limits, is_active'
    )
    .eq('slug', s)
    .maybeSingle()
  if (evErr) return <ErrorView message={`Error: ${evErr.message}`} />
  if (!event) return <ErrorView message="Encargo no encontrado." />

  const {
    data: { session },
  } = await supabase.auth.getSession()
  let canManage = false

  if (session?.user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .maybeSingle()
    canManage = canManageEventos((profile as { role?: string } | null)?.role ?? null)
  }

  const isActive = Boolean((event as { is_active?: boolean }).is_active)
  if (!isActive && !canManage) {
    return <ErrorView message="Este encargo no está activo." />
  }

  const eventDateYmd = String((event as { event_date?: string }).event_date ?? '').trim()
  const eventTime = String((event as { event_time?: string }).event_time ?? '').trim()
  if (!canManage && eventDateYmd && eventTime && isPastInMadrid(eventDateYmd, eventTime)) {
    return <ErrorView message="Este encargo ya pasó." />
  }

  const enabledIds = parseEnabledProductIds((event as { enabled_product_ids?: unknown }).enabled_product_ids)
  const categoryLimits = parseEventCategoryLimits((event as { category_limits?: unknown }).category_limits)

  const cartaFull = await loadEventCartaMenu(supabase, [])
  if (!cartaFull.ok) return <ErrorView message={cartaFull.message} />

  const allMenuItems = cartaFull.data.items
  const clientMenuItems = allMenuItems.filter((row) =>
    isEventProductEnabled(eventOrderProductId(row.articulo_id), enabledIds)
  )
  if (clientMenuItems.length === 0) {
    return <ErrorView message="No hay productos activos en este encargo." />
  }

  const packOverride = (event as { pack_items?: unknown }).pack_items
  let packItems: Array<{ product_id: string; quantity: number }> = []

  if (Array.isArray(packOverride)) {
    packItems = packOverride
      .map((it: { product_id?: string; quantity?: number }) => ({
        product_id: String(it?.product_id ?? ''),
        quantity: Number(it?.quantity ?? 0) || 0,
      }))
      .filter((it) => it.product_id && it.quantity > 0)
  } else {
    const { data: dp, error: dpErr } = await supabase.from('event_default_pack').select('items').maybeSingle()
    if (dpErr) return <ErrorView message={`Error cargando pack: ${dpErr.message}`} />
    const items = (dp as { items?: unknown })?.items
    if (Array.isArray(items)) {
      packItems = items
        .map((it: { product_id?: string; quantity?: number }) => ({
          product_id: String(it?.product_id ?? ''),
          quantity: Number(it?.quantity ?? 0) || 0,
        }))
        .filter((it) => it.product_id && it.quantity > 0)
    }
  }

  const clientIdSet = new Set(clientMenuItems.map((r) => eventOrderProductId(r.articulo_id)))
  const startingPack = packItems.filter((it) => clientIdSet.has(it.product_id))

  const backHref = canManage ? '/dashboard/eventos' : null

  return (
    <EventEncargoCartaClient
      event={{
        id: String((event as { id: string }).id),
        slug: String((event as { slug: string }).slug),
        name: String((event as { name: string }).name),
        event_date: eventDateYmd,
        event_time: eventTime,
      }}
      allMenuItems={allMenuItems}
      clientMenuItems={clientMenuItems}
      menuCategories={cartaFull.data.menuCategories}
      categoryCoverById={cartaFull.data.categoryCoverById}
      categoryCoverScaleById={cartaFull.data.categoryCoverScaleById}
      startingPackItems={startingPack}
      initialEnabledProductIds={enabledIds}
      initialCategoryLimits={categoryLimits}
      canManage={canManage}
      backHref={backHref}
    />
  )
}
