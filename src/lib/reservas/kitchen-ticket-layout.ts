/** Formato lógico único: sirve tanto a la previsualización como a ESC/POS. */
export type TicketPrintLine = {
  kind: 'text' | 'item' | 'brand' | 'rule' | 'meta'
  text: string
  align?: 'left' | 'center'
  bold?: boolean
  doubleHeight?: boolean
  quantity?: number
}

export type KitchenTicketPayload = {
  name: string
  date: string
  time: string
  guests: number | null
  language: 'ca' | 'es' | 'en'
  selection: 'food' | 'drink' | 'all'
  observations: string
  items: Array<{ quantity: number; name: string; note: string }>
}

export const KITCHEN_PRINTERS = [
  { id: 'kitchen', label: 'Cocina' },
  { id: 'tpv1', label: 'TPV1' },
] as const
export type KitchenPrinterId = (typeof KITCHEN_PRINTERS)[number]['id']

function normalize(value: unknown): string {
  return String(value ?? '').normalize('NFC').replace(/[\x00-\x1f\x7f]/g, ' ').trim()
}

/** Mismo algoritmo de corte de palabras para 42/34/36 columnas. */
export function wrapKitchenTicket(value: unknown, width: number): string[] {
  const words = normalize(value).split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if (current && current.length + word.length + 1 > width) {
      lines.push(current)
      current = ''
    }
    if (word.length > width) {
      if (current) lines.push(current)
      current = ''
      for (let i = 0; i < word.length; i += width) {
        const chunk = word.slice(i, i + width)
        if (chunk.length === width) lines.push(chunk)
        else current = chunk
      }
    } else {
      current = current ? current + ' ' + word : word
    }
  }
  if (current) lines.push(current)
  return lines
}

/**
 * Cabecera de 42 caracteres térmicos:
 * fecha al extremo izquierdo, hora centrada y comensales al extremo derecho.
 */
export function formatKitchenTicketMeta(
  date: unknown, time: unknown, guests: unknown,
): string {
  const width = 42
  const left = normalize(date).slice(0, 12)
  const middle = normalize(time).slice(0, 8)
  const number = Number(guests)
  const right = Number.isFinite(number) && number > 0
    ? String(Math.trunc(number)) + ' PAX' : ''
  const cells = Array<string>(width).fill(' ')
  const centerStart = Math.floor((width - middle.length) / 2)
  const rightStart = width - right.length
  if (left.length >= centerStart || (right && centerStart + middle.length >= rightStart)) {
    throw new Error('Cabecera de fecha, hora y comensales demasiado larga')
  }
  for (let i = 0; i < left.length; i++) cells[i] = left[i]
  for (let i = 0; i < middle.length; i++) cells[centerStart + i] = middle[i]
  for (let i = 0; i < right.length; i++) cells[rightStart + i] = right[i]
  return cells.join('')
}

export function buildKitchenTicketLayout(order: KitchenTicketPayload): TicketPrintLine[] {
  if (!order.items?.length) throw new Error('Comanda vacía')
  const notesHeading = {
    ca: 'OBSERVACIONS',
    es: 'OBSERVACIONES',
    en: 'NOTES',
  }[order.language]
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(order.date ?? ''))
  const date = dateParts
    ? dateParts[3] + '/' + dateParts[2] + '/' + dateParts[1].slice(2)
    : normalize(order.date)
  const separator = '-'.repeat(42)
  const lines: TicketPrintLine[] = [
    // La misma cabecera se rasteriza con el logo a la izquierda en ESC/POS.
    { kind: 'brand', text: '' },
    ...wrapKitchenTicket(order.name || '-', 42).map((text) => ({
      kind: 'text' as const, text, align: 'center' as const, bold: true, doubleHeight: true,
    })),
    { kind: 'rule', text: '' },
    { kind: 'meta', text: formatKitchenTicketMeta(date, order.time, order.guests) },
    { kind: 'rule', text: '' },
  ]

  for (const item of order.items) {
    const quantity = Number(item.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) continue
    const names = wrapKitchenTicket(item.name, 34)
    lines.push({ kind: 'item', quantity, text: names[0] || 'SIN NOMBRE' })
    for (const name of names.slice(1)) lines.push({ kind: 'text', text: '    ' + name })
    for (const note of wrapKitchenTicket(item.note, 36)) {
      lines.push({ kind: 'text', text: '    ' + note })
    }
    lines.push({ kind: 'text', text: '' })
  }
  if (normalize(order.observations)) {
    lines.push({ kind: 'text', text: separator })
    lines.push({ kind: 'text', text: notesHeading + ':', bold: true })
    for (const text of wrapKitchenTicket(order.observations, 42)) {
      lines.push({ kind: 'text', text })
    }
  }
  lines.push({ kind: 'text', text: '', align: 'center' })
  lines.push({ kind: 'text', text: '', align: 'center' })
  lines.push({ kind: 'text', text: '', align: 'center' })
  return lines
}