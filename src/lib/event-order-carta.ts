import type { EventCategoryLimits } from '@/lib/event-encargo-config'

export type EventOrderPortion = 'entero' | 'medio'

/** Controles de pedido sobre la carta digital. */
export type EventOrderCartaControl = {
  qtyByProductId: Record<string, number>
  onQuantityChange: (
    articuloId: number,
    quantity: number,
    opts?: { portion?: EventOrderPortion }
  ) => void
  /** Pulsa el producto para sumar 1 (sin +/− en la tarjeta). */
  tapToAdd?: boolean
}

/** Edición de encargo: activar productos/categorías y límites por categoría. */
export type EventEncargoEditControl = {
  active: boolean
  enabledProductIds: Set<string>
  onToggleProduct: (articuloId: number) => void
  onToggleParentCategory: (parentKey: string) => void
  onToggleSubCategory: (parentKey: string, subKey: string) => void
  categoryLimits: EventCategoryLimits
  onSetParentLimit: (parentKey: string, max: number | null) => void
  onSetSubLimit: (subKey: string, max: number | null) => void
  productToggleBusyId?: number | null
}

const MEDIO_SUFFIX = ':medio'

export function eventOrderProductId(articuloId: number): string {
  return String(articuloId)
}

/** Clave de carrito: mismo artículo TPV, ración entero o medio (como en TPV). */
export function eventOrderCartKey(
  articuloId: number,
  portion: EventOrderPortion = 'entero'
): string {
  const id = eventOrderProductId(articuloId)
  return portion === 'medio' ? `${id}${MEDIO_SUFFIX}` : id
}

export function parseEventOrderCartKey(key: string): {
  articuloId: number
  portion: EventOrderPortion
} | null {
  const raw = String(key ?? '').trim()
  if (!raw) return null
  if (raw.endsWith(MEDIO_SUFFIX)) {
    const base = raw.slice(0, -MEDIO_SUFFIX.length)
    const articuloId = Number(base)
    if (!Number.isFinite(articuloId) || articuloId <= 0) return null
    return { articuloId, portion: 'medio' }
  }
  const articuloId = Number(raw)
  if (!Number.isFinite(articuloId) || articuloId <= 0) return null
  return { articuloId, portion: 'entero' }
}

export function eventOrderQtyFor(
  control: EventOrderCartaControl | undefined,
  articuloId: number,
  portion: EventOrderPortion = 'entero'
): number {
  if (!control) return 0
  return Math.max(0, Number(control.qtyByProductId[eventOrderCartKey(articuloId, portion)]) || 0)
}

/** Línea lista para RPC / guardado (ración medio = mismo product_id + is_half). */
export type EventOrderSubmitItem = {
  product_id: string
  quantity: number
  is_half?: boolean
  notes?: string | null
}

export function qtyByIdToSubmitItems(qtyById: Record<string, number>): EventOrderSubmitItem[] {
  const out: EventOrderSubmitItem[] = []
  for (const [key, quantityRaw] of Object.entries(qtyById)) {
    const quantity = Math.max(0, Math.min(999, Number(quantityRaw) || 0))
    if (quantity <= 0) continue
    const parsed = parseEventOrderCartKey(key)
    if (!parsed) {
      // Clave numérica de un segundo artículo TPV (par entero/medio legacy).
      const pid = String(key).trim()
      if (!pid) continue
      out.push({ product_id: pid, quantity })
      continue
    }
    if (parsed.portion === 'medio') {
      out.push({
        product_id: eventOrderProductId(parsed.articuloId),
        quantity,
        is_half: true,
      })
    } else {
      out.push({
        product_id: eventOrderProductId(parsed.articuloId),
        quantity,
      })
    }
  }
  return out
}

export type EventOrderStartingPackItem = {
  product_id: string
  quantity: number
}

function lineLooksHalf(row: {
  is_half?: boolean
  notes?: string | null
  name?: string | null
}): boolean {
  if (row.is_half === true) return true
  const notes = String(row.notes ?? '').trim()
  if (/^(1\/2|½|medio|mitad|half)$/i.test(notes)) return true
  const name = String(row.name ?? '').trim()
  return /^(1\/2|½)\b/i.test(name)
}

/**
 * Convierte líneas de event_orders.items → claves de carrito (`id` / `id:medio`)
 * para hidratar qtyById al reabrir el pedido cliente.
 */
export function eventOrderItemsToStartingPack(
  items: unknown
): EventOrderStartingPackItem[] {
  if (!Array.isArray(items)) return []
  const merged = new Map<string, number>()
  for (const raw of items) {
    const row = raw as {
      product_id?: string
      quantity?: number
      is_half?: boolean
      notes?: string | null
      name?: string | null
    }
    const pid = String(row.product_id ?? '').trim()
    const qty = Math.max(0, Math.min(999, Number(row.quantity) || 0))
    if (!pid || qty <= 0) continue
    const articuloId = Number(pid)
    let key = pid
    if (Number.isFinite(articuloId) && articuloId > 0) {
      key = eventOrderCartKey(
        articuloId,
        lineLooksHalf(row) ? 'medio' : 'entero'
      )
    }
    merged.set(key, (merged.get(key) ?? 0) + qty)
  }
  return [...merged.entries()].map(([product_id, quantity]) => ({
    product_id,
    quantity,
  }))
}
