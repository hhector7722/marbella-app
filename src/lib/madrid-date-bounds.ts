import { fromZonedTime } from 'date-fns-tz'

/** Hora 0–23 del instante en calendario Europe/Madrid (timestamptz ISO). */
export function getHourFromMadridIso(iso: string | null | undefined): number {
  if (!iso || typeof iso !== 'string') return 12
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 12
  const h = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    hour: 'numeric',
    hour12: false,
  }).format(d)
  const n = parseInt(h, 10)
  return Number.isFinite(n) ? Math.min(23, Math.max(0, n)) : 12
}

/** Límites UTC ISO para un día civil en Europe/Madrid (timestamptz). */
export function madridDayUtcRangeIso(yyyyMmDd: string): { startIso: string; endIso: string } {
  const start = fromZonedTime(`${yyyyMmDd}T00:00:00.000`, 'Europe/Madrid')
  const end = fromZonedTime(`${yyyyMmDd}T23:59:59.999`, 'Europe/Madrid')
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

export function madridRangeUtcIso(startYmd: string, endYmd: string): { startIso: string; endIso: string } {
  const { startIso } = madridDayUtcRangeIso(startYmd)
  const { endIso } = madridDayUtcRangeIso(endYmd)
  return { startIso, endIso }
}

/** yyyy-MM-dd del instante en calendario Madrid. */
export function formatYmdInMadrid(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  if (!y || !m || !day) return ''
  return `${y}-${m}-${day}`
}

/** HH:mm en Madrid para mostrar en tablas a partir de ISO. */
export function formatMadridHmFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}
