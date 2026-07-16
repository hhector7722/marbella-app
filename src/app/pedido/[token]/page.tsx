import { createClient } from '@/utils/supabase/server'
import { formatYmdInMadrid } from '@/lib/madrid-date-bounds'
import { loadEventCartaMenu } from '@/lib/load-event-carta-menu'
import {
  isEventProductEnabled,
  parseEnabledProductIds,
  parseEventCategoryLimits,
} from '@/lib/event-encargo-config'
import { eventOrderProductId, eventOrderItemsToStartingPack } from '@/lib/event-order-carta'
import { expandEnabledIdsWithMedioPartners } from '@/lib/carta-medio-merge'
import { loadPedidoContactWhatsAppPhone } from '@/lib/load-pedido-contact-phone'
import ClientPedidoCartaClient from './ClientPedidoCartaClient'
import { PedidoEnviadoView } from './PedidoEnviadoView'
import { canClientOpenPedidoCarta } from '@/lib/reservas-encargos-calendar'

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
          <p className="text-[11px] font-black uppercase tracking-widest text-[#36606F]">Pedido</p>
          <p className="mt-2 text-sm font-bold text-zinc-900">{message}</p>
        </div>
      </div>
    </main>
  )
}

export default async function ClientPedidoPage(props: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await props.params
  const token = String(rawToken ?? '').trim()
  if (!token) return <ErrorView message="Enlace no válido." />

  const supabase = await createClient()
  const contactWhatsAppPhone = await loadPedidoContactWhatsAppPhone(supabase)

  const { data: event, error: evErr } = await supabase
    .from('events')
    .select(
      'id, slug, name, event_date, event_time, guest_count, enabled_product_ids, category_limits, is_active, client_edit_enabled, client_edit_token, client_order_submitted_at'
    )
    .eq('client_edit_token', token)
    .maybeSingle()

  if (evErr) return <ErrorView message={`Error: ${evErr.message}`} />
  if (!event) return <ErrorView message="Enlace no válido." />

  const row = event as {
    id: string
    slug: string
    name: string
    event_date?: string
    event_time?: string
    guest_count?: number | null
    enabled_product_ids?: unknown
    category_limits?: unknown
    is_active?: boolean
    client_edit_enabled?: boolean
    client_order_submitted_at?: string | null
  }

  // Doble condición: enlace abierto Y aún no enviado por el cliente.
  if (
    !canClientOpenPedidoCarta({
      client_edit_enabled: row.client_edit_enabled,
      client_order_submitted_at: row.client_order_submitted_at,
    })
  ) {
    return <PedidoEnviadoView contactWhatsAppPhone={contactWhatsAppPhone} />
  }

  if (!row.is_active) {
    return <ErrorView message="Este pedido no está activo." />
  }

  const eventDateYmd = String(row.event_date ?? '').trim()
  const eventTime = String(row.event_time ?? '').trim()
  if (eventDateYmd && eventTime && isPastInMadrid(eventDateYmd, eventTime)) {
    return <ErrorView message="Este pedido ya pasó." />
  }

  const enabledIds = parseEnabledProductIds(row.enabled_product_ids)
  const categoryLimits = parseEventCategoryLimits(row.category_limits)

  const cartaFull = await loadEventCartaMenu(supabase, [])
  if (!cartaFull.ok) return <ErrorView message={cartaFull.message} />

  const allMenuItems = cartaFull.data.items
  const enabledWithMedio = expandEnabledIdsWithMedioPartners(enabledIds, allMenuItems)
  const clientMenuItems = allMenuItems.filter((r) =>
    isEventProductEnabled(eventOrderProductId(r.articulo_id), enabledWithMedio)
  )
  if (clientMenuItems.length === 0) {
    return <ErrorView message="No hay productos activos en este pedido." />
  }

  // Pedido ya enviado (p. ej. tras reabrir): hidratar carrito con esas líneas.
  let startingPackItems: Array<{ product_id: string; quantity: number }> = []
  const { data: cartPayload, error: cartErr } = await supabase.rpc(
    'get_client_event_order_items_by_token',
    { p_token: token }
  )
  if (cartErr) {
    return <ErrorView message={`Error cargando el pedido: ${cartErr.message}`} />
  }
  const cartJson = cartPayload as { ok?: boolean; items?: unknown; error?: string } | null
  if (cartJson?.ok === false && cartJson.error) {
    return <ErrorView message="No se pudo cargar el pedido anterior." />
  }
  startingPackItems = eventOrderItemsToStartingPack(cartJson?.items)

  return (
    <ClientPedidoCartaClient
      token={token}
      event={{
        id: row.id,
        slug: row.slug,
        name: row.name,
        event_date: eventDateYmd,
        event_time: eventTime,
      }}
      guestCount={row.guest_count ?? null}
      allMenuItems={allMenuItems}
      clientMenuItems={clientMenuItems}
      menuCategories={cartaFull.data.menuCategories}
      categoryCoverById={cartaFull.data.categoryCoverById}
      categoryCoverScaleById={cartaFull.data.categoryCoverScaleById}
      startingPackItems={startingPackItems}
      initialEnabledProductIds={enabledIds}
      initialCategoryLimits={categoryLimits}
      contactWhatsAppPhone={contactWhatsAppPhone}
    />
  )
}
