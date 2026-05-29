'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  type EventOrderItem,
  type EventOrderRow,
} from '../[eventId]/pedidos/PedidosEventoClient'

export type PedidoConEncargo = EventOrderRow & {
  event_name: string
  event_slug: string
  event_date: string
}

function itemsToLabel(items: EventOrderItem[]): string {
  if (!items?.length) return ' '
  return items
    .filter((it) => (Number(it.quantity) || 0) > 0)
    .map((it) => `${it.name} ×${it.quantity}`)
    .join(' · ')
}

function formatEur(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return ' '
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value)
  } catch {
    return `${Number(value).toFixed(2)} €`
  }
}

const STATUS_LABEL: Record<EventOrderRow['status'], string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
}

export default function PedidosTodosClient({ orders }: { orders: PedidoConEncargo[] }) {
  const cardClass = 'rounded-xl border border-zinc-100 bg-white shadow-sm'

  return (
    <div className={cn(cardClass, 'overflow-hidden')}>
      <div className="overflow-auto">
        <table className="w-full min-w-[920px] border-collapse">
          <thead>
            <tr className="bg-zinc-50">
              <th className="px-3 py-3 text-left text-[11px] font-black uppercase tracking-wider text-zinc-600">
                Encargo
              </th>
              <th className="px-3 py-3 text-left text-[11px] font-black uppercase tracking-wider text-zinc-600">
                Responsable
              </th>
              <th className="px-3 py-3 text-left text-[11px] font-black uppercase tracking-wider text-zinc-600">
                Items
              </th>
              <th className="px-3 py-3 text-left text-[11px] font-black uppercase tracking-wider text-zinc-600">
                Total
              </th>
              <th className="px-3 py-3 text-left text-[11px] font-black uppercase tracking-wider text-zinc-600">
                Fecha
              </th>
              <th className="px-3 py-3 text-left text-[11px] font-black uppercase tracking-wider text-zinc-600">
                Estado
              </th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-zinc-100">
                <td className="px-3 py-3 text-sm font-bold text-zinc-900">
                  <Link
                    href={`/dashboard/eventos/${o.event_id}/pedidos`}
                    className="text-[#36606F] underline-offset-2 hover:underline"
                  >
                    {o.event_name}
                  </Link>
                  <p className="mt-0.5 text-xs font-semibold text-zinc-500">{o.event_date}</p>
                </td>
                <td className="px-3 py-3 text-sm font-bold text-zinc-900">{o.responsible_name}</td>
                <td className="px-3 py-3 text-xs text-zinc-700">{itemsToLabel(o.items)}</td>
                <td className="px-3 py-3 text-sm font-black text-zinc-900">{formatEur(o.total_amount)}</td>
                <td className="px-3 py-3 text-xs text-zinc-600">{o.created_at}</td>
                <td className="px-3 py-3 text-sm font-bold text-zinc-800">{STATUS_LABEL[o.status]}</td>
              </tr>
            ))}
            {orders.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-sm font-bold text-zinc-600" colSpan={6}>
                  Sin pedidos todavía.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
