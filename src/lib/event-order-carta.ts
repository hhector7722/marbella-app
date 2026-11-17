import type { EventCategoryLimits } from '@/lib/event-encargo-config'

export type EventOrderPortion = 'entero' | 'medio'

/** Un Plato Marbella siempre representa una sola ración configurada. */
export type PlatoMarbellaChoices = {
  entrante: string
  principal: string
  guarnicion: string
}
export type PlatoMarbellaOrderEntry = {
  key: string
  productId: number
  choices: PlatoMarbellaChoices
  note: string
}

const PLATO_NOTE_MARKER = 'PLATO MARBELLA'

/** Formato legible para la comanda staff y persistente en event_orders.items.notes. */
export function formatPlatoMarbellaItemNotes(
  choices: PlatoMarbellaChoices,
  note = ''
): string {
  const core = [
    PLATO_NOTE_MARKER,
    `Entrante: ${choices.entrante.trim()}`,
    `Principal: ${choices.principal.trim()}`,
    `Guarnición: ${choices.guarnicion.trim()}`,
  ].join('\n')
  return note.trim() ? `${core}\nIndicaciones: ${note.trim()}` : core
}

/** Reconstrucción al reabrir un pedido; no se mezclan platos con el mismo artículo. */
export function parsePlatoMarbellaItemNotes(notes: string | null | undefined): {
  choices: PlatoMarbellaChoices
  note: string
} | null {
  const raw = String(notes ?? '').trim().replace(/\r\n/g, '\n')
  const match = /^PLATO MARBELLA\nEntrante: ([^\n]+)\nPrincipal: ([^\n]+)\nGuarnición: ([^\n]+)(?:\nIndicaciones: ([\s\S]*))?$/.exec(raw)
  if (!match) return null
  return {
    choices: {
      entrante: match[1].trim(),
      principal: match[2].trim(),
      guarnicion: match[3].trim(),
    },
    note: match[4]?.trim() ?? '',
  }
}

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
  /** `/pedido`: controles +/− sobre la foto sin alterar la carta original. */
  photoControls?: boolean
  /** /pedido: acceso al mismo carrito desde categorías y subcategorías. */
  openCart?: () => void
  totalUnits?: number
  /** Pedido cliente: cada plato nuevo requiere tres elecciones independientes. */
  onAddPlatoMarbella?: (productId: number, choices: PlatoMarbellaChoices) => void
  onRemoveLastPlatoMarbella?: (productId: number) => void
  /** Solicitud explícita de volver a abrir el configurador desde el carrito. */
  platoBuilderRequest?: number
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

export function qtyByIdToSubmitItems(
  qtyById: Record<string, number>,
  notesById: Record<string, string> = {}
): EventOrderSubmitItem[] {
  const out: EventOrderSubmitItem[] = []
  for (const [key, quantityRaw] of Object.entries(qtyById)) {
    const quantity = Math.max(0, Math.min(999, Number(quantityRaw) || 0))
    if (quantity <= 0) continue
    const notes = notesById[key]?.trim()
    const parsed = parseEventOrderCartKey(key)
    if (!parsed) {
      // Clave numérica de un segundo artículo TPV (par entero/medio legacy).
      const pid = String(key).trim()
      if (!pid) continue
      out.push({ product_id: pid, quantity, ...(notes ? { notes } : {}) })
      continue
    }
    if (parsed.portion === 'medio') {
      out.push({
        product_id: eventOrderProductId(parsed.articuloId),
        quantity,
        is_half: true,
        ...(notes ? { notes } : {}),
      })
    } else {
      out.push({
        product_id: eventOrderProductId(parsed.articuloId),
        quantity,
        ...(notes ? { notes } : {}),
      })
    }
  }
  return out
}

export type EventOrderStartingPackItem = {
  product_id: string
  quantity: number
  notes?: string | null
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
  const merged = new Map<string, EventOrderStartingPackItem>()
  const separatePlates: EventOrderStartingPackItem[] = []
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
    const note = String(row.notes ?? '').trim()
    const clientNote = /^(1\/2|½|medio|mitad|half)$/i.test(note) ? null : note || null
    if (parsePlatoMarbellaItemNotes(clientNote)) {
      // La RPC acepta varias líneas con un mismo product_id si llevan notas distintas.
      // Cada plato permanece como una línea individual, incluso al rehidratar.
      for (let i = 0; i < qty; i++) {
        separatePlates.push({ product_id: pid, quantity: 1, notes: clientNote })
      }
      continue
    }
    const existing = merged.get(key)
    merged.set(key, {
      product_id: key,
      quantity: Math.min(999, (existing?.quantity ?? 0) + qty),
      notes: existing?.notes || clientNote,
    })
  }
  return [...merged.values(), ...separatePlates]
}
