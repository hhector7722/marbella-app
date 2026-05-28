import { createClient } from '@/utils/supabase/server'
import EventOrderFormClient, {
  type PublicEventRow,
  type PublicEventProductRow,
} from './EventOrderFormClient'
import { cn } from '@/lib/utils'
import { formatYmdInMadrid } from '@/lib/madrid-date-bounds'

function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  const m = String(ymd ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null
  return { y, m: mo, d }
}

function parseTimeHm(time: string): { hh: number; mm: number } | null {
  const m = String(time ?? '')
    .trim()
    .match(/^(\d{2}):(\d{2})/)
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  return { hh, mm }
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

function formatHumanDateEs(ymd: string): string {
  const p = parseYmd(ymd)
  if (!p) return ymd
  const dt = new Date(p.y, p.m - 1, p.d)
  try {
    return new Intl.DateTimeFormat('es-ES', {
      weekday: 'long',
      day: '2-digit',
      month: 'short',
    }).format(dt)
  } catch {
    return ymd
  }
}

function toHm(time: string): string {
  const t = String(time ?? '').trim()
  const m = t.match(/^(\d{2}):(\d{2})/)
  if (!m) return t
  return `${m[1]}:${m[2]}`
}

function ErrorView({ title, message }: { title: string; message: string }) {
  return (
    <main className="flex min-h-[100dvh] flex-col bg-white text-zinc-900">
      <div className="mx-auto w-full max-w-2xl px-5 pb-safe pt-safe md:px-8">
        <div className="mt-6 rounded-xl border border-zinc-100 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-widest text-[#36606F]">{title}</p>
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
  if (!s) return <ErrorView title="Evento" message="Evento inválido." />

  const { data: event, error: evErr } = await supabase
    .from('events')
    .select('id, slug, name, event_date, event_time, description, pack_items, enabled_product_ids, is_active')
    .eq('slug', s)
    .maybeSingle()
  if (evErr) return <ErrorView title="Evento" message={`Error cargando evento: ${evErr.message}`} />
  if (!event) return <ErrorView title="Evento" message="Evento no encontrado." />

  const isActive = Boolean((event as any).is_active)
  if (!isActive) return <ErrorView title="Evento" message="Este evento está inactivo." />

  const eventDateYmd = String((event as any).event_date ?? '').trim()
  const eventTime = String((event as any).event_time ?? '').trim()
  if (eventDateYmd && eventTime && isPastInMadrid(eventDateYmd, eventTime)) {
    return <ErrorView title="Evento" message="Este evento ya pasó." />
  }

  const eventRow: PublicEventRow = {
    id: String((event as any).id),
    slug: String((event as any).slug),
    name: String((event as any).name),
    event_date: eventDateYmd,
    event_time: eventTime,
    description: (event as any).description ? String((event as any).description) : null,
  }

  const enabledIds = (event as any).enabled_product_ids as string[] | null

  // Products for event
  const productsQuery = supabase
    .from('event_products')
    .select('product_id, name, price, category, is_active')
    .eq('is_active', true)
    .order('category', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })
    .limit(5000)

  const { data: baseProducts, error: pErr } = enabledIds?.length
    ? await productsQuery.in('product_id', enabledIds)
    : await productsQuery
  if (pErr) return <ErrorView title="Evento" message={`Error cargando productos: ${pErr.message}`} />

  const products: PublicEventProductRow[] = ((baseProducts ?? []) as any[]).map((p) => ({
    product_id: String(p.product_id ?? ''),
    name: String(p.name ?? ''),
    price: Number(p.price) || 0,
    category: p.category ? String(p.category) : null,
  }))

  // Pack (event override or default pack singleton)
  const packOverride = (event as any).pack_items as any[] | null
  let packItems: Array<{ product_id: string; quantity: number }> = []

  if (Array.isArray(packOverride)) {
    packItems = packOverride
      .map((it: any) => ({ product_id: String(it?.product_id ?? ''), quantity: Number(it?.quantity ?? 0) || 0 }))
      .filter((it) => it.product_id && it.quantity > 0)
  } else {
    const { data: dp, error: dpErr } = await supabase.from('event_default_pack').select('label, items').maybeSingle()
    if (dpErr) return <ErrorView title="Evento" message={`Error cargando pack: ${dpErr.message}`} />
    const items = (dp as any)?.items
    if (Array.isArray(items)) {
      packItems = items
        .map((it: any) => ({ product_id: String(it?.product_id ?? ''), quantity: Number(it?.quantity ?? 0) || 0 }))
        .filter((it) => it.product_id && it.quantity > 0)
    }
  }

  // Keep only products that exist in this event's available list.
  const productIdSet = new Set(products.map((p) => p.product_id))
  const startingPack = packItems.filter((it) => productIdSet.has(it.product_id))

  return (
    <main className="flex min-h-[100dvh] flex-col bg-white text-zinc-900">
      <div className="mx-auto w-full max-w-2xl px-5 pb-safe pt-safe md:px-8">
        <div className="mt-3 rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-widest text-[#36606F]">Evento</p>
          <p className="mt-1 text-lg font-black text-zinc-900">{eventRow.name}</p>
          <p className={cn('mt-1 text-sm font-bold text-zinc-700')}>
            {formatHumanDateEs(eventRow.event_date)} · {toHm(eventRow.event_time)}h
          </p>
        </div>

        <div className="mt-4">
          <EventOrderFormClient event={eventRow} products={products} startingPackItems={startingPack} />
        </div>
      </div>
    </main>
  )
}

