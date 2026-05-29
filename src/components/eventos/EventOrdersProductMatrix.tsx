'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  buildEventOrderProductColumns,
  formatOrderQuantityCell,
  quantityForProduct,
  type EventOrderMatrixRow,
} from '@/lib/event-orders-matrix'

export function EventOrdersProductMatrix({
  orders,
  showEncargoColumn = false,
}: {
  orders: EventOrderMatrixRow[]
  /** Listado global: muestra encargo + fecha del evento. */
  showEncargoColumn?: boolean
}) {
  const productColumns = useMemo(() => buildEventOrderProductColumns(orders), [orders])

  const fixedColCount = (showEncargoColumn ? 2 : 0) + 1
  const totalCols = fixedColCount + productColumns.length

  const thClass =
    'px-3 py-3 text-left text-[11px] font-black uppercase tracking-wider text-zinc-600 whitespace-nowrap'
  const tdClass = 'px-3 py-3 text-sm font-bold text-zinc-900 tabular-nums text-center'

  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-zinc-50">
            {showEncargoColumn ? (
              <th className={cn(thClass, 'text-left')}>Encargo</th>
            ) : null}
            <th className={cn(thClass, 'text-left')}>Nombre</th>
            {productColumns.map((col) => (
              <th key={col.productId} className={cn(thClass, 'max-w-[120px] truncate')} title={col.name}>
                {col.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-t border-zinc-100">
              {showEncargoColumn ? (
                <td className="px-3 py-3 text-left text-sm font-bold text-zinc-900">
                  {o.event_id ? (
                    <Link
                      href={`/dashboard/eventos/${o.event_id}/pedidos`}
                      className="text-[#36606F] underline-offset-2 hover:underline"
                    >
                      {o.event_name ?? 'Encargo'}
                    </Link>
                  ) : (
                    (o.event_name ?? ' ')
                  )}
                  {o.event_date ? (
                    <p className="mt-0.5 text-xs font-semibold text-zinc-500">{o.event_date}</p>
                  ) : null}
                </td>
              ) : null}
              <td className="px-3 py-3 text-left text-sm font-bold text-zinc-900">{o.responsible_name}</td>
              {productColumns.map((col) => {
                const qty = quantityForProduct(o, col.productId)
                return (
                  <td key={col.productId} className={tdClass}>
                    {formatOrderQuantityCell(qty)}
                  </td>
                )
              })}
            </tr>
          ))}
          {orders.length === 0 ? (
            <tr>
              <td className="px-3 py-8 text-center text-sm font-bold text-zinc-600" colSpan={Math.max(totalCols, 1)}>
                Sin pedidos todavía.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}
