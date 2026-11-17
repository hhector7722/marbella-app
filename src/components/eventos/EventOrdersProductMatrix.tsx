'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/modal'
import { parsePlatoMarbellaItemNotes } from '@/lib/event-order-carta'
import { TABLE_COMPONENT_ID } from '@/lib/design-system'
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
  const [selectedPlate, setSelectedPlate] = useState<{ orderId: string; productId: string } | null>(null)
  const selectedOrder = orders.find((order) => order.id === selectedPlate?.orderId)
  const selectedPlateItems = (selectedOrder?.items ?? []).flatMap((item) => {
    if (String(item.product_id) !== selectedPlate?.productId) return []
    const parsed = parsePlatoMarbellaItemNotes(item.notes)
    return parsed ? [{ ...parsed, name: item.name }] : []
  })

  const fixedColCount = (showEncargoColumn ? 2 : 0) + 1
  const totalCols = fixedColCount + productColumns.length

  const thClass = 'text-left whitespace-nowrap'
  const tdClass = 'px-3 py-3 text-sm font-bold text-zinc-900 tabular-nums text-center'

  return (
    <div className="min-w-0">
      <div className="overflow-auto"><table data-component={TABLE_COMPONENT_ID} data-instance="event-orders-matrix" className="w-full">
        <thead>
          <tr>
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
                const hasPlates = (o.items ?? []).some((item) =>
                  String(item.product_id) === col.productId &&
                  Boolean(parsePlatoMarbellaItemNotes(item.notes))
                )
                return (
                  <td key={col.productId} className={tdClass}>
                    {hasPlates ? (
                      <button
                        type="button"
                        className="mx-auto flex min-h-10 flex-col items-center justify-center gap-0.5 text-[#1b4a82] underline-offset-2 hover:underline"
                        onClick={() => setSelectedPlate({ orderId: o.id, productId: col.productId })}
                      >
                        <span className="font-black tabular-nums">{formatOrderQuantityCell(qty)}</span>
                        <span className="text-[10px] font-semibold whitespace-nowrap">Ver ingredientes</span>
                      </button>
                    ) : formatOrderQuantityCell(qty)}
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
      </table></div>
      <Modal
        open={selectedPlate != null && selectedPlateItems.length > 0}
        onClose={() => setSelectedPlate(null)}
        title="Platos Marbella · Ingredientes"
        instance="event-orders-plato-marbella"
        variant="standard"
      >
        <div className="space-y-2 pb-2">
          <p className="text-xs font-semibold text-zinc-500">
            {selectedOrder?.responsible_name} · {selectedPlateItems.length} platos configurados
          </p>
          {selectedPlateItems.map((plate, index) => (
            <details key={index} className="group overflow-hidden rounded-xl border border-zinc-200">
              <summary className="flex min-h-12 cursor-pointer items-center justify-between px-3 text-sm font-bold text-zinc-900">
                <span>Plato {index + 1}</span>
                <span className="text-xs text-[#1b4a82] group-open:hidden">Ver elecciones</span>
                <span className="hidden text-xs text-[#1b4a82] group-open:inline">Ocultar</span>
              </summary>
              <div className="space-y-1.5 border-t border-zinc-100 bg-zinc-50 p-3 text-xs text-zinc-800">
                <p><strong>Entrante:</strong> {plate.choices.entrante}</p>
                <p><strong>Principal:</strong> {plate.choices.principal}</p>
                <p><strong>Guarnición:</strong> {plate.choices.guarnicion}</p>
                {plate.note ? <p><strong>Indicaciones:</strong> {plate.note}</p> : null}
              </div>
            </details>
          ))}
        </div>
      </Modal>
    </div>
  )
}
