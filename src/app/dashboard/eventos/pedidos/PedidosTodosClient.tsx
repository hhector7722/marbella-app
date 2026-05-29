'use client'

import { cn } from '@/lib/utils'
import { EventOrdersProductMatrix } from '@/components/eventos/EventOrdersProductMatrix'
import type { EventOrderRow } from '../[eventId]/pedidos/PedidosEventoClient'

export type PedidoConEncargo = EventOrderRow & {
  event_name: string
  event_slug: string
  event_date: string
}

export default function PedidosTodosClient({ orders }: { orders: PedidoConEncargo[] }) {
  const cardClass = 'rounded-xl border border-zinc-100 bg-white shadow-sm'

  return (
    <div className={cn(cardClass, 'overflow-hidden')}>
      <EventOrdersProductMatrix orders={orders} showEncargoColumn />
    </div>
  )
}
