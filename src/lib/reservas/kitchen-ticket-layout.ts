/** Formato lógico único: sirve tanto a la previsualización como a ESC/POS. */
export type TicketPrintLine = {
  kind: 'text' | 'item'
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

export function buildKitchenTicketLayout(order: KitchenTicketPayload): TicketPrintLine[] {
  if (!order.items?.length) throw new Error('Comanda vacía')
  const lang = {
    ca: ['COMANDA', 'CLIENT', 'OBSERVACIONS', 'MENJAR', 'BEGUDA', 'TOT', 'FI COMANDA'],
    es: ['COMANDA', 'CLIENTE', 'OBSERVACIONES', 'COMIDA', 'BEBIDA', 'TODO', 'FIN COMANDA'],
    en: ['KITCHEN ORDER', 'CUSTOMER', 'NOTES', 'FOOD', 'DRINKS', 'ALL', 'END ORDER'],
  }[order.language]
  const section = { food: lang[3], drink: lang[4], all: lang[5] }[order.selection]
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(order.date ?? ''))
  const date = dateParts
    ? dateParts[3] + '/' + dateParts[2] + '/' + dateParts[1].slice(2)
    : normalize(order.date)
  const separator = '-'.repeat(42)
  const lines: TicketPrintLine[] = [
    { kind: 'text', text: 'BAR LA MARBELLA', align: 'center', bold: true },
    { kind: 'text', text: lang[0], align: 'center', bold: true, doubleHeight: true },
    { kind: 'text', text: section, align: 'center' },
    { kind: 'text', text: separator },
    {
      kind: 'text',
      text: [date, normalize(order.time), Number(order.guests) > 0 ? order.guests + ' PAX' : '']
        .filter(Boolean).join('  '),
    },
    ...wrapKitchenTicket(lang[1] + ': ' + (order.name || '-'), 42).map((text) => ({
      kind: 'text' as const, text,
    })),
    { kind: 'text', text: separator },
  ]

  for (const item of order.items) {
    const quantity = Number(item.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) continue
    const names = wrapKitchenTicket(item.name, 34)
    lines.push({ kind: 'item', quantity, text: names[0] || 'SIN NOMBRE', bold: true })
    for (const name of names.slice(1)) lines.push({ kind: 'text', text: '    ' + name })
    for (const note of wrapKitchenTicket(item.note, 36)) {
      lines.push({ kind: 'text', text: '    ' + note })
    }
    lines.push({ kind: 'text', text: '' })
  }
  if (normalize(order.observations)) {
    lines.push({ kind: 'text', text: separator })
    lines.push({ kind: 'text', text: lang[2] + ':', bold: true })
    for (const text of wrapKitchenTicket(order.observations, 42)) {
      lines.push({ kind: 'text', text })
    }
  }
  lines.push({ kind: 'text', text: separator })
  lines.push({ kind: 'text', text: lang[6], align: 'center' })
  lines.push({ kind: 'text', text: '', align: 'center' })
  lines.push({ kind: 'text', text: '', align: 'center' })
  lines.push({ kind: 'text', text: '', align: 'center' })
  return lines
}