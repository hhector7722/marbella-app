import { createClient } from '@/utils/supabase/server'
import EventEncargoCartaClient from './EventEncargoCartaClient'
import { formatYmdInMadrid } from '@/lib/madrid-date-bounds'
import { loadEventCartaMenu } from '@/lib/load-event-carta-menu'
import { canManageEventos } from '@/app/dashboard/eventos/roles'

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
    .select('id, slug, name, event_date, event_time, pack_items, enabled_product_ids, is_active')
    .eq('slug', s)
    .maybeSingle()
  if (evErr) return <ErrorView message={`Error: ${evErr.message}`} />
  if (!event) return <ErrorView message="Encargo no encontrado." />

  const {
    data: { session },
  } = await supabase.auth.getSession()
  let mode: 'manage' | 'order' = 'order'

  if (session?.user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .maybeSingle()
    if (canManageEventos((profile as { role?: string } | null)?.role ?? null)) {
      mode = 'manage'
    }
  }

  const isActive = Boolean((event as { is_active?: boolean }).is_active)
  if (!isActive && mode === 'order') {
    return <ErrorView message="Este encargo no está activo." />
  }

  const eventDateYmd = String((event as { event_date?: string }).event_date ?? '').trim()
  const eventTime = String((event as { event_time?: string }).event_time ?? '').trim()
  if (mode === 'order' && eventDateYmd && eventTime && isPastInMadrid(eventDateYmd, eventTime)) {
    return <ErrorView message="Este encargo ya pasó." />
  }

  const enabledIds = ((event as { enabled_product_ids?: string[] | null }).enabled_product_ids as string[] | null) ?? []

  const productsQuery = supabase.from('event_products').select('product_id').eq('is_active', true).limit(5000)

  const { data: baseProducts, error: pErr } = enabledIds.length
    ? await productsQuery.in('product_id', enabledIds)
    : await productsQuery

  if (pErr) return <ErrorView message={`Error cargando productos: ${pErr.message}`} />

  const enabledProductIds = ((baseProducts ?? []) as { product_id?: string }[])
    .map((p) => String(p.product_id ?? '').trim())
    .filter(Boolean)

  const carta = await loadEventCartaMenu(supabase, enabledProductIds)
  if (!carta.ok) return <ErrorView message={carta.message} />

  const packOverride = (event as { pack_items?: unknown }).pack_items
  let packItems: Array<{ product_id: string; quantity: number }> = []

  if (Array.isArray(packOverride)) {
    packItems = packOverride
      .map((it: { product_id?: string; quantity?: number }) => ({
        product_id: String(it?.product_id ?? ''),
        quantity: Number(it?.quantity ?? 0) || 0,
      }))
      .filter((it) => it.product_id && it.quantity > 0)
  } else if (mode === 'order') {
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

  const productIdSet = new Set(enabledProductIds.length ? enabledProductIds : carta.data.items.map((r) => String(r.articulo_id)))
  const startingPack = packItems.filter((it) => productIdSet.has(it.product_id))

  const backHref = mode === 'manage' ? '/dashboard/eventos' : null

  return (
    <EventEncargoCartaClient
      mode={mode}
      event={{
        id: String((event as { id: string }).id),
        slug: String((event as { slug: string }).slug),
        name: String((event as { name: string }).name),
        event_date: eventDateYmd,
        event_time: eventTime,
      }}
      menuItems={carta.data.items}
      menuCategories={carta.data.menuCategories}
      categoryCoverById={carta.data.categoryCoverById}
      categoryCoverScaleById={carta.data.categoryCoverScaleById}
      startingPackItems={startingPack}
      backHref={backHref}
    />
  )
}
