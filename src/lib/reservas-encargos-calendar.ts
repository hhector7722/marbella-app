import type { EventOrderItem } from '@/app/dashboard/eventos/[eventId]/pedidos/PedidosEventoClient'

export type EncargoRow = {
  id: string
  slug: string
  name: string
  event_date: string
  event_time: string
  guest_count: number | null
  reservation_id: string | null
  is_active: boolean
}

export type EncargoOrderRow = {
  id: string
  event_id: string
  responsible_name: string
  items: EventOrderItem[]
  status: 'pending' | 'confirmed' | 'cancelled'
  created_at: string
}

export function timeShortHm(t: string): string {
  if (!t) return '--:--'
  return t.length >= 5 ? t.slice(0, 5) : t
}

export function groupEncargosByDate(rows: EncargoRow[]): Record<string, EncargoRow[]> {
  const map: Record<string, EncargoRow[]> = {}
  for (const e of rows) {
    const key = e.event_date.slice(0, 10)
    if (!map[key]) map[key] = []
    map[key].push(e)
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => {
      const ta = timeShortHm(a.event_time)
      const tb = timeShortHm(b.event_time)
      if (ta !== tb) return ta.localeCompare(tb)
      return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
    })
  }
  return map
}

export function reservationIdsWithEncargo(encargos: EncargoRow[]): Set<string> {
  const set = new Set<string>()
  for (const e of encargos) {
    const rid = e.reservation_id?.trim()
    if (rid) set.add(rid)
  }
  return set
}

export function calendarReservationsForDay<T extends { id: string }>(
  dayYmd: string,
  byDate: Record<string, T[]>,
  linkedReservationIds: Set<string>
): T[] {
  return (byDate[dayYmd] ?? []).filter((r) => !linkedReservationIds.has(r.id))
}

export function calendarOrphanEncargosForDay(dayYmd: string, encargosByDate: Record<string, EncargoRow[]>) {
  return (encargosByDate[dayYmd] ?? []).filter((e) => !e.reservation_id)
}

export type CalendarCellEntry =
  | { kind: 'reservation'; time: string; key: string }
  | { kind: 'encargo'; time: string; key: string }

export function buildCalendarCellEntries(
  dayYmd: string,
  reservationsByDate: Record<string, Array<{ id: string; reservation_time: string }>>,
  encargosByDate: Record<string, EncargoRow[]>,
  linkedReservationIds: Set<string>
): CalendarCellEntry[] {
  const entries: CalendarCellEntry[] = []

  for (const r of calendarReservationsForDay(dayYmd, reservationsByDate, linkedReservationIds)) {
    entries.push({
      kind: 'reservation',
      time: timeShortHm(r.reservation_time),
      key: `r-${r.id}`,
    })
  }

  for (const e of calendarOrphanEncargosForDay(dayYmd, encargosByDate)) {
    entries.push({
      kind: 'encargo',
      time: timeShortHm(e.event_time),
      key: `e-${e.id}`,
    })
  }

  entries.sort((a, b) => a.time.localeCompare(b.time) || a.key.localeCompare(b.key))
  return entries
}

export function encargosForReservation(reservationId: string, encargos: EncargoRow[]): EncargoRow[] {
  return encargos.filter((e) => e.reservation_id === reservationId)
}

export function ordersForDay(
  dayYmd: string,
  encargosByDate: Record<string, EncargoRow[]>,
  ordersByEventId: Record<string, EncargoOrderRow[]>
): EncargoOrderRow[] {
  const events = encargosByDate[dayYmd] ?? []
  const out: EncargoOrderRow[] = []
  for (const ev of events) {
    const list = ordersByEventId[ev.id] ?? []
    out.push(...list)
  }
  out.sort((a, b) => a.created_at.localeCompare(b.created_at))
  return out
}
