'use client'

import { useMemo } from 'react'
import { EventOrdersProductMatrix } from '@/components/eventos/EventOrdersProductMatrix'
import { Surface } from '@/components/ui/Surface'

export type EventRow = {
  id: string
  slug: string
  name: string
  event_date: string
  event_time: string
  is_active: boolean
}

export type EventOrderItem = {
  product_id: string
  name: string
  quantity: number
  unit_price: number
  notes?: string | null
}

export type EventOrderRow = {
  id: string
  event_id: string
  responsible_name: string
  items: EventOrderItem[]
  total_amount: number | null
  status: 'pending' | 'confirmed' | 'cancelled'
  notes: string | null
  created_at: string
}

function countItems(items: EventOrderItem[]): number {
  let n = 0
  for (const it of items ?? []) n += Math.max(0, Number(it.quantity) || 0)
  return n
}

export default function PedidosEventoClient({
  event,
  orders,
}: {
  event: EventRow
  orders: EventOrderRow[]
  canManage?: boolean
}) {
  const totalOrders = orders.length
  const totalItems = useMemo(() => orders.reduce((acc, o) => acc + countItems(o.items), 0), [orders])

  return (
    <div className="space-y-4">
      <Surface variant="block" instance="eventos-pedidos-resumen">
        <div data-element="header" className="flex items-center justify-between gap-2">
          <span data-element="title">Resumen</span>
          <a
            href={`/api/eventos/${event.id}/export`}
            className="shrink-0 text-[11px] font-black text-ds-texto uppercase tracking-widest hover:opacity-80 transition-colors min-h-[48px] flex items-center"
            aria-label="Exportar CSV"
          >
            Exportar CSV
          </a>
        </div>
        <div className="p-4">
          <p className="text-sm font-bold text-zinc-800">
            Pedidos: {totalOrders === 0 ? ' ' : totalOrders} · Items: {totalItems === 0 ? ' ' : totalItems}
          </p>
        </div>
      </Surface>

      <Surface variant="block" instance="eventos-pedidos-matriz" className="overflow-hidden">
        <EventOrdersProductMatrix orders={orders} />
      </Surface>
    </div>
  )
}
