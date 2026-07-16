import type { LucideIcon } from 'lucide-react'
import {
  Calendar,
  Euro,
  FileText,
  Package,
  AlertTriangle,
  User,
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

/** Iconos discretos sobre la tarjeta — sin contenedor. */
const ICON_PETROL = 'text-[#2F5D6A]/45'
const ICON_ALERT = 'text-rose-500/70'

export type NotificationVisual = {
  Icon: LucideIcon
  iconClass: string
  critical?: boolean
}

/** Icono outline por tipo de evento — sin contenedor de fondo. */
export function getNotificationVisual(
  type: string,
  entityType?: string | null
): NotificationVisual {
  const t = type.toLowerCase()
  const entity = (entityType ?? '').toLowerCase()
  const haystack = `${t} ${entity}`

  if (
    haystack.includes('alert') ||
    haystack.includes('critical') ||
    haystack.includes('urgent') ||
    haystack.includes('warning')
  ) {
    return { Icon: AlertTriangle, iconClass: ICON_ALERT, critical: true }
  }

  if (
    haystack.includes('albaran') ||
    haystack.includes('invoice') ||
    haystack.includes('purchase')
  ) {
    return { Icon: FileText, iconClass: ICON_PETROL }
  }

  if (
    haystack.includes('pedido') ||
    haystack.includes('order') ||
    haystack.includes('event_order') ||
    haystack.includes('client_order')
  ) {
    return { Icon: Package, iconClass: ICON_PETROL }
  }

  if (haystack.includes('reserva') || haystack.includes('reservation')) {
    return { Icon: Calendar, iconClass: ICON_PETROL }
  }

  if (
    haystack.includes('schedule') ||
    haystack.includes('horario') ||
    haystack.includes('personal') ||
    haystack.includes('staff') ||
    haystack.includes('profile') ||
    haystack.includes('worker')
  ) {
    return { Icon: User, iconClass: ICON_PETROL }
  }

  if (
    haystack.includes('cash') ||
    haystack.includes('cierre') ||
    haystack.includes('caja') ||
    haystack.includes('closing')
  ) {
    return { Icon: Euro, iconClass: ICON_PETROL }
  }

  return { Icon: FileText, iconClass: ICON_PETROL }
}

function parseNotificationDate(iso: string): Date | null {
  const raw = iso.replace('T', ' ').replace('Z', '').trim()
  const [datePart, timePart] = raw.split(' ')
  if (!datePart || !timePart) return null
  const [y, m, d] = datePart.split('-').map(Number)
  const [hh, mm] = timePart.split(':').map(Number)
  if ([y, m, d, hh, mm].some((n) => Number.isNaN(n))) return null
  return new Date(y, m - 1, d, hh, mm)
}

/** Línea inferior: fecha + hora (menor jerarquía visual). */
export function formatNotificationDateTimeLine(iso: string): string {
  const dt = parseNotificationDate(iso)
  if (!dt) return ''
  const date = dt.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const time = dt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  return `${date}  ${time}`
}

export function formatNotificationTime(iso: string): string {
  const dt = parseNotificationDate(iso)
  if (!dt) return ''
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
