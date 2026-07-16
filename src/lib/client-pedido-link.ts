/** URL privada de edición de pedido por cliente. */
export function buildClientPedidoUrl(token: string, origin?: string): string {
  const t = String(token ?? '').trim()
  const path = `/pedido/${t}`
  if (origin) return `${origin.replace(/\/$/, '')}${path}`
  return path
}

/** Teléfono público del restaurante (WhatsApp / llamada). Override: NEXT_PUBLIC_MARBELLA_WHATSAPP. */
export function getMarbellaPublicWhatsAppPhone(): string | null {
  const fromEnv = String(process.env.NEXT_PUBLIC_MARBELLA_WHATSAPP ?? '')
    .replace(/\D/g, '')
    .trim()
  if (fromEnv.length >= 9) return formatWhatsAppPhone(fromEnv)
  // Teléfono público Bar La Marbella (Taulat 81, Barcelona)
  return '34932254427'
}

/** Email del contacto WhatsApp tras envío de pedido cliente (`profiles.phone`). */
export const PEDIDO_CONTACT_EMAIL = 'hhector7722@gmail.com' as const

/**
 * Normaliza un teléfono de contacto de pedido (perfil Héctor vía RPC).
 * Fallback al fijo del restaurante solo si no hay teléfono de perfil.
 */
export function resolvePedidoContactWhatsAppPhone(rawPhone: string | null | undefined): string | null {
  const formatted = formatWhatsAppPhone(String(rawPhone ?? ''))
  if (formatted.length >= 9) return formatted
  return getMarbellaPublicWhatsAppPhone()
}

export function buildWhatsAppUrl(phone: string | null | undefined, prefillText?: string): string | null {
  const formatted = formatWhatsAppPhone(String(phone ?? ''))
  if (formatted.length < 9) return null
  const text = String(prefillText ?? '').trim()
  if (!text) return `https://wa.me/${formatted}`
  return `https://wa.me/${formatted}?text=${encodeURIComponent(text)}`
}

export function buildMarbellaWhatsAppUrl(prefillText?: string): string | null {
  return buildWhatsAppUrl(getMarbellaPublicWhatsAppPhone(), prefillText)
}

/** Fecha local a partir de YYYY-MM-DD (sin Date('YYYY-MM-DD') nativo). */
export function formatClientPedidoDate(ymd: string): string {
  const parts = String(ymd ?? '')
    .slice(0, 10)
    .split('-')
    .map(Number)
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n <= 0)) return ''
  const [y, m, d] = parts
  const date = new Date(y, m - 1, d)
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

export function formatClientPedidoTime(time: string): string {
  const m = String(time ?? '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})/)
  if (!m) return ''
  const hh = String(Number(m[1])).padStart(2, '0')
  const mm = m[2]
  return `${hh}:${mm}`
}

export type ClientPedidoWhatsAppContext = {
  customerName: string
  pedidoUrl: string
  eventDate?: string | null
  eventTime?: string | null
  guestCount?: number | null
}

export function clientPedidoWhatsAppText(ctx: ClientPedidoWhatsAppContext): string {
  const name = String(ctx.customerName ?? '').trim() || 'cliente'
  const url = String(ctx.pedidoUrl ?? '').trim()
  const dateLabel = formatClientPedidoDate(String(ctx.eventDate ?? ''))
  const timeLabel = formatClientPedidoTime(String(ctx.eventTime ?? ''))
  const pax =
    ctx.guestCount != null && Number(ctx.guestCount) > 0 ? Math.floor(Number(ctx.guestCount)) : null

  const lines = [
    `Hola ${name} 😊`,
    '',
    'Tal y como hemos hablado, aquí tenéis el enlace para preparar vuestro pedido.',
    '',
  ]

  if (dateLabel) lines.push(`📅 ${dateLabel}`)
  if (timeLabel) lines.push(`🕒 ${timeLabel}`)
  if (pax != null) lines.push(`👥 ${pax} ${pax === 1 ? 'persona' : 'personas'}`)
  if (dateLabel || timeLabel || pax != null) lines.push('')

  lines.push(
    'Podéis añadir todos los productos y enviarnos el pedido cuando lo tengáis preparado.',
    '',
    'Una vez recibido, si necesitáis hacer cualquier cambio, solo tenéis que escribirnos.',
    '',
    '¡Muchas gracias!',
    '',
    url
  )

  return lines.join('\n')
}

export function formatWhatsAppPhone(phone: string): string {
  let cleaned = String(phone ?? '').replace(/\D/g, '')
  if (cleaned.startsWith('34') && cleaned.length === 11) return cleaned
  if (cleaned.length === 9) return `34${cleaned}`
  return cleaned
}
