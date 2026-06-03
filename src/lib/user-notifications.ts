export type UserNotificationRow = {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  action_url: string
  entity_type: string | null
  entity_id: string | null
  read_at: string | null
  created_at: string
}

export function formatNotificationTime(iso: string): string {
  const raw = iso.replace('T', ' ').replace('Z', '').trim()
  const [datePart, timePart] = raw.split(' ')
  if (!datePart || !timePart) return ''
  const [y, m, d] = datePart.split('-').map(Number)
  const [hh, mm] = timePart.split(':').map(Number)
  if ([y, m, d, hh, mm].some((n) => Number.isNaN(n))) return ''
  const dt = new Date(y, m - 1, d, hh, mm)
  const now = new Date()
  const sameDay =
    dt.getFullYear() === now.getFullYear() &&
    dt.getMonth() === now.getMonth() &&
    dt.getDate() === now.getDate()
  if (sameDay) {
    return dt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  }
  return dt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}
