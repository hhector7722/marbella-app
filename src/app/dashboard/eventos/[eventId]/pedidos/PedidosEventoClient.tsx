'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Download } from 'lucide-react'
import { EventOrdersProductMatrix } from '@/components/eventos/EventOrdersProductMatrix'

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

  const cardClass = 'rounded-xl border border-zinc-100 bg-white shadow-sm'
  const headerPill = 'text-[11px] font-black uppercase tracking-widest text-[#36606F]'

  return (
    <div className="space-y-4">
      <div className={cn(cardClass, 'p-4')}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className={headerPill}>Resumen</p>
            <p className="mt-1 text-sm font-bold text-zinc-800">
              Pedidos: {totalOrders === 0 ? ' ' : totalOrders} · Items: {totalItems === 0 ? ' ' : totalItems}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={`/api/eventos/${event.id}/export`}
              className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#36606F] px-4 text-[12px] font-black uppercase tracking-wider text-white transition-colors hover:bg-[#2a4a56]"
              aria-label="Exportar CSV"
            >
              <Download className="h-4 w-4" strokeWidth={2.5} />
              Exportar CSV
            </a>
          </div>
        </div>
      </div>

      <div className={cn(cardClass, 'overflow-hidden')}>
        <EventOrdersProductMatrix orders={orders} />
      </div>
    </div>
  )
}
