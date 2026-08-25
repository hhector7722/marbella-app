'use client'

import { EventOrdersProductMatrix } from '@/components/eventos/EventOrdersProductMatrix'
import { Surface } from '@/components/ui/Surface'
import type { EventOrderRow } from '../[eventId]/pedidos/PedidosEventoClient'

export type PedidoConEncargo = EventOrderRow & {
  event_name: string
  event_slug: string
  event_date: string
}

export default function PedidosTodosClient({ orders }: { orders: PedidoConEncargo[] }) {
  return (
    <Surface variant="block" instance="eventos-pedidos-todos" className="overflow-hidden">
      <EventOrdersProductMatrix orders={orders} showEncargoColumn />
    </Surface>
  )
}
