import type { EventOrderItem } from '@/app/dashboard/eventos/[eventId]/pedidos/PedidosEventoClient'

export type EventOrderMatrixRow = {
  id: string
  responsible_name: string
  items: EventOrderItem[]
  event_id?: string
  event_name?: string
  event_date?: string
}

export type EventOrderProductColumn = {
  productId: string
  name: string
}

/** Columnas de producto únicas en todos los pedidos, ordenadas por nombre. */
export function buildEventOrderProductColumns(orders: EventOrderMatrixRow[]): EventOrderProductColumn[] {
  const byId = new Map<string, string>()
  for (const order of orders) {
    for (const item of order.items ?? []) {
      const pid = String(item.product_id ?? '').trim()
      const name = String(item.name ?? '').trim()
      if (!pid || !name) continue
      if (!byId.has(pid)) byId.set(pid, name)
    }
  }
  return Array.from(byId.entries())
    .map(([productId, name]) => ({ productId, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
}

export function quantityForProduct(order: EventOrderMatrixRow, productId: string): number {
  const item = (order.items ?? []).find((it) => String(it.product_id) === productId)
  const qty = Number(item?.quantity) || 0
  return qty > 0 ? qty : 0
}

/** Regla ZERO-DISPLAY: 0 → espacio vacío. */
export function formatOrderQuantityCell(qty: number): string {
  return qty > 0 ? String(qty) : ' '
}
