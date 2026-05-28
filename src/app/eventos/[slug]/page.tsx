import { createClient } from '@/utils/supabase/server'
import EventOrderFormClient, { type PublicEventRow } from './EventOrderFormClient'
import { formatYmdInMadrid } from '@/lib/madrid-date-bounds'
import { loadEventCartaMenu } from '@/lib/load-event-carta-menu'

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

  const enabledIds = ((event as any).enabled_product_ids as string[] | null) ?? []

  const productsQuery = supabase
    .from('event_products')
    .select('product_id')
    .eq('is_active', true)
    .limit(5000)

  const { data: baseProducts, error: pErr } = enabledIds.length
    ? await productsQuery.in('product_id', enabledIds)
    : await productsQuery
  if (pErr) return <ErrorView title="Evento" message={`Error cargando productos: ${pErr.message}`} />

  const enabledProductIds = ((baseProducts ?? []) as any[])
    .map((p) => String(p.product_id ?? '').trim())
    .filter(Boolean)

  const carta = await loadEventCartaMenu(supabase, enabledProductIds)
  if (!carta.ok) return <ErrorView title="Evento" message={carta.message} />

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

  const productIdSet = new Set(enabledProductIds)
  const startingPack = packItems.filter((it) => productIdSet.has(it.product_id))

  return (
    <main className="flex h-[100dvh] flex-col bg-white text-zinc-900">
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col px-5 pb-safe pt-safe md:px-8">
        <header className="shrink-0 pb-2 pt-1">
          <p className="text-[11px] font-black uppercase tracking-widest text-[#36606F]">Encargo · {eventRow.name}</p>
          <p className="mt-1 text-sm font-bold text-zinc-700">
            {formatHumanDateEs(eventRow.event_date)} · {toHm(eventRow.event_time)}h
          </p>
          {eventRow.description ? (
            <p className="mt-1 text-xs font-medium text-zinc-500">{eventRow.description}</p>
          ) : null}
        </header>

        <div className="flex min-h-0 flex-1 flex-col pb-28">
          <EventOrderFormClient
            event={eventRow}
            menuItems={carta.data.items}
            menuCategories={carta.data.menuCategories}
            categoryCoverById={carta.data.categoryCoverById}
            categoryCoverScaleById={carta.data.categoryCoverScaleById}
            startingPackItems={startingPack}
          />
        </div>
      </div>
    </main>
  )
}
