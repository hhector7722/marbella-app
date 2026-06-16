'use client'

import { Pencil, X } from 'lucide-react'

import type { EventOrderItem } from '@/app/dashboard/eventos/[eventId]/pedidos/PedidosEventoClient'
import { cn } from '@/lib/utils'
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking'

export function EncargoOrderViewModal({
  encargoName,
  encargoTime,
  items,
  onClose,
  onEdit,
}: {
  encargoName: string
  encargoTime: string
  items: EventOrderItem[]
  onClose: () => void
  onEdit: () => void
}) {
  useModalUsageTracking({
    open: true,
    usageId: 'encargo-order-view',
    usageLabel: 'Ver pedido encargo',
  })

  return (
    <div
      className="fixed inset-0 z-[10060] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="presentation"
    >
      <div
        className={cn(
          'bg-white rounded-[2rem] shadow-2xl flex flex-col overflow-hidden',
          'w-full max-w-[min(36rem,calc(100vw-2rem))]',
          'max-h-[calc(100dvh-2rem)]',
          'animate-in zoom-in-95 duration-200'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#36606F] px-4 py-3 text-white shrink-0 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/80">Pedido</p>
            <h3 className="text-base font-black truncate">
              {encargoTime} · {encargoName}
            </h3>
          </div>
          <button
            type="button"
            onClick={onEdit}
            className="shrink-0 min-h-12 min-w-12 flex items-center justify-center rounded-xl hover:bg-white/10"
            aria-label="Editar encargo"
          >
            <Pencil size={18} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 min-h-12 min-w-12 flex items-center justify-center rounded-xl hover:bg-white/10"
            aria-label="Cerrar"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3">
          {items.length === 0 ? (
            <p className="py-10 text-center text-xs font-semibold text-zinc-500">
              Sin productos en el pedido.
            </p>
          ) : (
            <div className="overflow-x-auto border border-zinc-100 rounded-xl">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50">
                    <th className="px-3 py-2.5 font-black uppercase text-[9px] tracking-wider text-zinc-500">
                      Producto
                    </th>
                    <th className="px-3 py-2.5 font-black uppercase text-[9px] tracking-wider text-zinc-500 w-20 text-center">
                      Cantidad
                    </th>
                    <th className="px-3 py-2.5 font-black uppercase text-[9px] tracking-wider text-zinc-500">
                      Notas
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {items.map((it) => (
                    <tr key={it.product_id}>
                      <td className="px-3 py-2.5 font-bold text-zinc-800">{it.name}</td>
                      <td className="px-3 py-2.5 font-mono font-bold text-zinc-700 text-center tabular-nums">
                        {it.quantity > 0 ? it.quantity : ' '}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-zinc-600 whitespace-pre-wrap">
                        {it.notes?.trim() ? it.notes : ' '}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
