import type { PublicMenuRow } from '@/components/public/PublicCarta'
import type { MenuCategoryCatalogEntry } from '@/lib/carta-plato-marbella'
import type { CartaPhotoScale } from '@/lib/carta-product-photo'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isEventProductEnabled,
  parseEnabledProductIds,
  parseEventCategoryLimits,
  type EventCategoryLimits,
} from '@/lib/event-encargo-config'
import { eventOrderProductId } from '@/lib/event-order-carta'
import { loadEventCartaMenu } from '@/lib/load-event-carta-menu'

export type EncargoPageEvent = {
  id: string
  slug: string
  name: string
  event_date: string
  event_time: string
  reservation_id: string | null
}

export type EncargoPagePayload = {
  event: EncargoPageEvent
  allMenuItems: PublicMenuRow[]
  clientMenuItems: PublicMenuRow[]
  menuCategories: MenuCategoryCatalogEntry[]
  categoryCoverById: Record<string, string | null>
  categoryCoverScaleById: Record<string, CartaPhotoScale>
  startingPackItems: Array<{ product_id: string; quantity: number }>
  initialEnabledProductIds: string[] | null
  initialCategoryLimits: EventCategoryLimits
}

type PackRow = { product_id?: string; quantity?: number }

function parsePackItems(raw: unknown): Array<{ product_id: string; quantity: number }> {
  if (!Array.isArray(raw)) return []
  return raw
    .map((it: PackRow) => ({
      product_id: String(it?.product_id ?? ''),
      quantity: Number(it?.quantity ?? 0) || 0,
    }))
    .filter((it) => it.product_id && it.quantity > 0)
}

export async function loadEncargoPageById(
  supabase: SupabaseClient,
  eventId: string
): Promise<{ ok: true; data: EncargoPagePayload } | { ok: false; message: string }> {
  const id = String(eventId ?? '').trim()
  if (!id) return { ok: false, message: 'Encargo no válido.' }

  const { data: event, error: evErr } = await supabase
    .from('events')
    .select(
      'id, slug, name, event_date, event_time, pack_items, enabled_product_ids, category_limits, reservation_id'
    )
    .eq('id', id)
    .maybeSingle()

  if (evErr) return { ok: false, message: `Error: ${evErr.message}` }
  if (!event) return { ok: false, message: 'Encargo no encontrado.' }

  const enabledIds = parseEnabledProductIds((event as { enabled_product_ids?: unknown }).enabled_product_ids)
  const categoryLimits = parseEventCategoryLimits((event as { category_limits?: unknown }).category_limits)

  const cartaFull = await loadEventCartaMenu(supabase, [])
  if (!cartaFull.ok) return { ok: false, message: cartaFull.message }

  const allMenuItems = cartaFull.data.items
  const clientMenuItems = allMenuItems.filter((row) =>
    isEventProductEnabled(eventOrderProductId(row.articulo_id), enabledIds)
  )
  if (clientMenuItems.length === 0) {
    return { ok: false, message: 'No hay productos activos en este encargo.' }
  }

  const packOverride = (event as { pack_items?: unknown }).pack_items
  let packItems = parsePackItems(packOverride)

  if (packItems.length === 0) {
    const { data: dp, error: dpErr } = await supabase.from('event_default_pack').select('items').maybeSingle()
    if (dpErr) return { ok: false, message: `Error cargando pack: ${dpErr.message}` }
    packItems = parsePackItems((dp as { items?: unknown })?.items)
  }

  const clientIdSet = new Set(clientMenuItems.map((r) => eventOrderProductId(r.articulo_id)))
  const startingPack = packItems.filter((it) => clientIdSet.has(it.product_id))

  return {
    ok: true,
    data: {
      event: {
        id: String((event as { id: string }).id),
        slug: String((event as { slug: string }).slug),
        name: String((event as { name: string }).name),
        event_date: String((event as { event_date: string }).event_date ?? ''),
        event_time: String((event as { event_time: string }).event_time ?? ''),
        reservation_id: (event as { reservation_id?: string | null }).reservation_id ?? null,
      },
      allMenuItems,
      clientMenuItems,
      menuCategories: cartaFull.data.menuCategories,
      categoryCoverById: cartaFull.data.categoryCoverById,
      categoryCoverScaleById: cartaFull.data.categoryCoverScaleById,
      startingPackItems: startingPack,
      initialEnabledProductIds: enabledIds,
      initialCategoryLimits: categoryLimits,
    },
  }
}
