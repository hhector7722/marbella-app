import type { EventOrderItem } from '@/app/dashboard/eventos/[eventId]/pedidos/PedidosEventoClient'
import type { EncargoOrderRow, EncargoRow } from '@/lib/reservas-encargos-calendar'
import { timeShortHm } from '@/lib/reservas-encargos-calendar'

export type StaffEncargoLineItem = {
  product_id: string
  quantity: number
  notes: string
  name?: string
}

export type DayAgendaReservationRow = {
  kind: 'reservation'
  id: string
  time: string
  title: string
  subtitle: string
  linkedEncargo: EncargoRow | null
}

export type DayAgendaEncargoRow = {
  kind: 'encargo'
  encargo: EncargoRow
  time: string
}

export type DayAgendaListRow = DayAgendaReservationRow | DayAgendaEncargoRow

function orderItemsCount(items: EncargoOrderRow['items']): number {
  return Array.isArray(items) ? items.length : 0
}

/**
 * Pedido “principal” del encargo (comanda staff).
 * Alineado con save_client_event_order_by_token: confirmed → pending más antiguo;
 * si hay varios pending, prioriza el que ya tiene líneas (cliente rellenó el shell).
 */
export function primaryOrderForEncargo(
  eventId: string,
  ordersByEventId: Record<string, EncargoOrderRow[]>
): EncargoOrderRow | null {
  const list = ordersByEventId[eventId] ?? []
  if (list.length === 0) return null
  const confirmed = list.find((o) => o.status === 'confirmed')
  if (confirmed) return confirmed
  const pending = list
    .filter((o) => o.status === 'pending')
    .slice()
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  const withItems = pending.find((o) => orderItemsCount(o.items) > 0)
  return withItems ?? pending[0] ?? list[0]
}

export function parseOrderItems(raw: unknown): EventOrderItem[] {
  if (!Array.isArray(raw)) return []
  const out: EventOrderItem[] = []
  for (const it of raw) {
    const row = it as {
      product_id?: string
      name?: string
      quantity?: number
      unit_price?: number
      notes?: string | null
    }
    const product_id = String(row.product_id ?? '').trim()
    const quantity = Number(row.quantity) || 0
    if (!product_id || quantity <= 0) continue
    out.push({
      product_id,
      name: String(row.name ?? '').trim() || product_id,
      quantity,
      unit_price: Number(row.unit_price) || 0,
      notes: row.notes ?? null,
    })
  }
  return out
}

export function orderItemsToStaffLines(items: EventOrderItem[]): StaffEncargoLineItem[] {
  return items.map((it) => ({
    product_id: it.product_id,
    quantity: it.quantity,
    notes: String(it.notes ?? '').trim(),
    name: it.name,
  }))
}

export function buildDayAgendaListRows(
  reservations: Array<{
    id: string
    customer_name: string
    reservation_time: string
    pax: number
  }>,
  encargos: EncargoRow[]
): DayAgendaListRow[] {
  const encargoByReservation = new Map<string, EncargoRow>()
  const orphanEncargos: EncargoRow[] = []

  for (const e of encargos) {
    const rid = e.reservation_id?.trim()
    if (rid) {
      if (!encargoByReservation.has(rid)) encargoByReservation.set(rid, e)
    } else {
      orphanEncargos.push(e)
    }
  }

  const rows: DayAgendaListRow[] = []

  for (const r of reservations) {
    rows.push({
      kind: 'reservation',
      id: r.id,
      time: timeShortHm(r.reservation_time),
      title: r.customer_name,
      subtitle: `${r.pax} pax`,
      linkedEncargo: encargoByReservation.get(r.id) ?? null,
    })
  }

  for (const e of orphanEncargos) {
    rows.push({
      kind: 'encargo',
      encargo: e,
      time: timeShortHm(e.event_time),
    })
  }

  rows.sort((a, b) => {
    const ta = a.kind === 'reservation' ? a.time : a.time
    const tb = b.kind === 'reservation' ? b.time : b.time
    if (ta !== tb) return ta.localeCompare(tb)
    const na = a.kind === 'reservation' ? a.title : a.encargo.name
    const nb = b.kind === 'reservation' ? b.title : b.encargo.name
    return na.localeCompare(nb, 'es', { sensitivity: 'base' })
  })

  return rows
}

export function encargoById(encargos: EncargoRow[], eventId: string): EncargoRow | null {
  return encargos.find((e) => e.id === eventId) ?? null
}
