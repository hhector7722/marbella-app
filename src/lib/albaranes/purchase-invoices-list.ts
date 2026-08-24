import { formatYmdInMadrid } from '@/lib/madrid-date-bounds'

/** Primera carga del histórico (SSR y recarga tras filtro). */
export const PURCHASE_INVOICES_INITIAL_LIMIT = 200
/** Cada pulsación de «VER MÁS». */
export const PURCHASE_INVOICES_PAGE_SIZE = 20

function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  const t = String(ymd ?? '').trim()
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null
  return { y, m: mo, d }
}

function formatYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(ymd: string, days: number): string {
  const p = parseYmd(ymd)
  if (!p) return ymd
  const dt = new Date(p.y, p.m - 1, p.d)
  dt.setDate(dt.getDate() + days)
  return formatYmd(dt)
}

export function getDefaultPurchaseInvoicesDateRange(): { dateFrom: string; dateTo: string } {
  const todayYmd = formatYmdInMadrid(new Date())
  return { dateFrom: addDays(todayYmd, -44), dateTo: todayYmd }
}
