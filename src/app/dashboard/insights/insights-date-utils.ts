import { getEuropeMadridYmdToday } from '@/utils/date-utils'

export type InsightsFilterMode = 'sem' | 'mes' | 'dia' | 'periodo'

export type InsightsMonth = { year: number; month: number }

export const MONTH_NAMES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const

export const MONTH_SHORT_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sept',
  'oct',
  'nov',
  'dic',
] as const

export function getPreviousInsightsMonth(now: Date = new Date()): InsightsMonth {
  const today = getEuropeMadridYmdToday(now)
  const [y, m] = today.split('-').map(Number)
  const anchor = new Date(y, m - 1, 1)
  anchor.setMonth(anchor.getMonth() - 1)
  return { year: anchor.getFullYear(), month: anchor.getMonth() + 1 }
}

export function monthBounds(fm: InsightsMonth): { from: string; to: string } {
  const lastDay = new Date(fm.year, fm.month, 0).getDate()
  const mm = String(fm.month).padStart(2, '0')
  return {
    from: `${fm.year}-${mm}-01`,
    to: `${fm.year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  }
}

export function shiftInsightsMonth(fm: InsightsMonth, delta: number): InsightsMonth {
  const d = new Date(fm.year, fm.month - 1 + delta, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

export function formatInsightsMonthLabel(fm: InsightsMonth): string {
  return `${MONTH_NAMES_ES[fm.month - 1]} ${fm.year}`
}

export function ymdFromLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function parseYmdLocal(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split('-').map(Number)
  return { y, m, d }
}

export function mondayOfWeekContaining(ymd: string): string {
  const { y, m, d } = parseYmdLocal(ymd)
  const date = new Date(y, m - 1, d)
  const dow = date.getDay()
  const offset = dow === 0 ? -6 : 1 - dow
  date.setDate(date.getDate() + offset)
  return ymdFromLocalDate(date)
}

export function weekBoundsFromMonday(mondayYmd: string): { from: string; to: string } {
  const { y, m, d } = parseYmdLocal(mondayYmd)
  const sun = new Date(y, m - 1, d + 6)
  return { from: mondayYmd, to: ymdFromLocalDate(sun) }
}

export function isoWeekNumber(ymd: string): number {
  const monday = mondayOfWeekContaining(ymd)
  const { y, m, d } = parseYmdLocal(monday)
  const mon = new Date(y, m - 1, d)
  const thu = new Date(y, m - 1, d + 3)
  const thuYear = thu.getFullYear()
  const jan4 = new Date(thuYear, 0, 4)
  const jan4Dow = jan4.getDay() || 7
  const week1Mon = new Date(thuYear, 0, 4 - (jan4Dow - 1))
  return 1 + Math.round((mon.getTime() - week1Mon.getTime()) / (7 * 86400000))
}

export function formatDayLabel(ymd: string): string {
  const { m, d } = parseYmdLocal(ymd)
  return `${d} ${MONTH_SHORT_ES[m - 1]}`
}

export function formatPeriodLabel(from: string, to: string): string {
  const f = parseYmdLocal(from)
  const t = parseYmdLocal(to)
  if (f.m === t.m && f.y === t.y) {
    return `${f.d}–${t.d} ${MONTH_SHORT_ES[f.m - 1]}`
  }
  return `${f.d} ${MONTH_SHORT_ES[f.m - 1]} – ${t.d} ${MONTH_SHORT_ES[t.m - 1]}`
}

export function buildWeekRows(
  viewYear: number,
  viewMonth: number
): Array<{ monday: string; days: string[] }> {
  const firstOfMonth = new Date(viewYear, viewMonth - 1, 1)
  const lastOfMonth = new Date(viewYear, viewMonth, 0)
  let cursor = mondayOfWeekContaining(ymdFromLocalDate(firstOfMonth))
  const rows: Array<{ monday: string; days: string[] }> = []

  for (let guard = 0; guard < 6; guard++) {
    const { y, m, d } = parseYmdLocal(cursor)
    const days: string[] = []
    for (let i = 0; i < 7; i++) {
      days.push(ymdFromLocalDate(new Date(y, m - 1, d + i)))
    }
    rows.push({ monday: cursor, days })
    const { y: ly, m: lm, d: ld } = parseYmdLocal(days[6]!)
    const lastCell = new Date(ly, lm - 1, ld)
    if (lastCell >= lastOfMonth) break
    cursor = ymdFromLocalDate(new Date(y, m - 1, d + 7))
  }

  return rows
}

export function buildMonthDays(viewYear: number, viewMonth: number): string[] {
  const lastDay = new Date(viewYear, viewMonth, 0).getDate()
  const days: string[] = []
  for (let d = 1; d <= lastDay; d++) {
    days.push(
      `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    )
  }
  return days
}

export function monthFromYmd(ymd: string): InsightsMonth {
  const { y, m } = parseYmdLocal(ymd)
  return { year: y, month: m }
}
