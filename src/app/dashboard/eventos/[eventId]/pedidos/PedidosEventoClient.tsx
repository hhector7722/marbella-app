'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Download, Loader2 } from 'lucide-react'
import { setEventOrderStatusAction } from '../../actions'

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

function formatEur(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return ' '
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value)
  } catch {
    return `${Number(value).toFixed(2)} €`
  }
}

function itemsToLabel(items: EventOrderItem[]): string {
  if (!items?.length) return ' '
  return items
    .filter((it) => (Number(it.quantity) || 0) > 0)
    .map((it) => `${it.name} ×${it.quantity}`)
    .join(' · ')
}

function countItems(items: EventOrderItem[]): number {
  let n = 0
  for (const it of items ?? []) n += Math.max(0, Number(it.quantity) || 0)
  return n
}

const STATUS_LABEL: Record<EventOrderRow['status'], string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
}

export default function PedidosEventoClient({
  event,
  orders,
  canManage = true,
}: {
  event: EventRow
  orders: EventOrderRow[]
  canManage?: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [changing, setChanging] = useState<Record<string, boolean>>({})

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
          <div className="shrink-0 flex items-center gap-2">
            <a
              href={`/api/eventos/${event.id}/export`}
              className="min-h-12 rounded-xl bg-[#36606F] px-4 text-[12px] font-black uppercase tracking-wider text-white hover:bg-[#2a4a56] transition-colors inline-flex items-center gap-2"
              aria-label="Exportar CSV"
            >
              <Download className="h-4 w-4" strokeWidth={2.5} />
              Exportar CSV
            </a>
          </div>
        </div>
      </div>

      <div className={cn(cardClass, 'overflow-hidden')}>
        <div className="overflow-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr className="bg-zinc-50">
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
                  Timestamp
                </th>
                <th className="px-3 py-3 text-left text-[11px] font-black uppercase tracking-wider text-zinc-600">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const isChanging = changing[o.id] ?? false
                return (
                  <tr key={o.id} className="border-t border-zinc-100">
                    <td className="px-3 py-3 text-sm font-bold text-zinc-900">{o.responsible_name}</td>
                    <td className="px-3 py-3 text-xs text-zinc-700">{itemsToLabel(o.items)}</td>
                    <td className="px-3 py-3 text-sm font-black text-zinc-900">{formatEur(o.total_amount)}</td>
                    <td className="px-3 py-3 text-xs text-zinc-600">{o.created_at}</td>
                    <td className="px-3 py-3">
                      {canManage ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            className="min-h-12 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-800 outline-none focus-visible:ring-2 focus-visible:ring-[#36606F]/25"
                            value={o.status}
                            disabled={isPending || isChanging}
                            onChange={(e) => {
                              const status = e.target.value as 'pending' | 'confirmed' | 'cancelled'
                              setChanging((curr) => ({ ...curr, [o.id]: true }))
                              startTransition(async () => {
                                const res = await setEventOrderStatusAction({ orderId: o.id, status })
                                setChanging((curr) => ({ ...curr, [o.id]: false }))
                                if (!res.success) {
                                  toast.error(res.message)
                                  return
                                }
                                toast.success('Estado actualizado')
                              })
                            }}
                            aria-label="Cambiar estado"
                          >
                            <option value="pending">Pendiente</option>
                            <option value="confirmed">Confirmado</option>
                            <option value="cancelled">Cancelado</option>
                          </select>
                          {isPending || isChanging ? (
                            <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
                          ) : null}
                        </div>
                      ) : (
                        <span className="inline-flex min-h-12 items-center rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm font-bold text-zinc-800">
                          {STATUS_LABEL[o.status]}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {orders.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-sm font-bold text-zinc-600" colSpan={5}>
                    Sin pedidos todavía.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

