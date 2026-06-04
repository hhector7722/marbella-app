import type { LucideIcon } from 'lucide-react'
import {
  AlertCircle,
  Banknote,
  Bell,
  Calendar,
  CalendarClock,
} from 'lucide-react'

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

export type NotificationVisual = {
  Icon: LucideIcon
  iconClass: string
  bgClass: string
  critical?: boolean
}

export function getNotificationVisual(type: string): NotificationVisual {
  const t = type.toLowerCase()
  if (t.includes('alert') || t.includes('critical') || t.includes('urgent')) {
    return {
      Icon: AlertCircle,
      iconClass: 'text-rose-600',
      bgClass: 'bg-rose-50',
      critical: true,
    }
  }
  if (t === 'schedule' || t.includes('horario')) {
    return { Icon: Calendar, iconClass: 'text-[#2F5D6A]', bgClass: 'bg-[#2F5D6A]/10' }
  }
  if (t === 'cash_closing' || t.includes('cierre') || t.includes('cash')) {
    return { Icon: Banknote, iconClass: 'text-[#2F5D6A]', bgClass: 'bg-[#2F5D6A]/10' }
  }
  if (t === 'reservation_new' || t.includes('reserva')) {
    return { Icon: CalendarClock, iconClass: 'text-[#2F5D6A]', bgClass: 'bg-[#2F5D6A]/10' }
  }
  return { Icon: Bell, iconClass: 'text-[#2F5D6A]', bgClass: 'bg-[#2F5D6A]/10' }
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
