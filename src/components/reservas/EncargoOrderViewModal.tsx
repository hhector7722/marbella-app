'use client'



import { useCallback, useRef, useState } from 'react'

import { Loader2, Pencil, Printer, X } from 'lucide-react'

import { toast } from 'sonner'



import type { EventOrderItem } from '@/app/dashboard/eventos/[eventId]/pedidos/PedidosEventoClient'

import {

  buildEncargoPrintHtml,

  printEncargoHtml,

} from '@/lib/reservas/print-encargo-document'

import { cn } from '@/lib/utils'

import { useModalUsageTracking } from '@/hooks/useModalUsageTracking'



function formatEncargoPrintDate(ymd: string) {

  const parts = ymd.slice(0, 10).split('-').map(Number)

  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return ymd

  const [y, m, d] = parts

  return `${d}/${String(m).padStart(2, '0')}/${String(y % 100).padStart(2, '0')}`

}



export function EncargoOrderViewModal({

  encargoName,

  encargoDate,

  encargoTime,

  contactPhone,

  items,

  onClose,

  onEdit,

}: {

  encargoName: string

  encargoDate: string

  encargoTime: string

  contactPhone?: string | null

  items: EventOrderItem[]

  onClose: () => void

  onEdit: () => void

}) {

  const tableRef = useRef<HTMLDivElement>(null)

  const [printBusy, setPrintBusy] = useState(false)



  useModalUsageTracking({

    open: true,

    usageId: 'encargo-order-view',

    usageLabel: 'Ver pedido encargo',

  })



  const handlePrint = useCallback(async () => {

    if (printBusy || items.length === 0) return

    setPrintBusy(true)

    try {

      const html = buildEncargoPrintHtml(

        {

          encargoDate: formatEncargoPrintDate(encargoDate),

          encargoTime,

          encargoName,

          contactPhone: contactPhone ?? null,

        },

        items

      )

      await printEncargoHtml(html)

    } catch (error) {

      console.error('encargo print failed', error)

      toast.error('No se pudo preparar la impresión del pedido.')

    } finally {

      setPrintBusy(false)

    }

  }, [printBusy, encargoName, encargoDate, encargoTime, contactPhone, items])



  return (

    <div

      className="fixed inset-0 z-[10060] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"

      onClick={(e) => {

        if (e.target === e.currentTarget) onClose()

      }}

      role="presentation"

    >

      <div

        className={cn(

          'bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden',

          'w-[min(26rem,calc(100vw-3rem))]',

          'max-h-[min(30rem,calc(100dvh-4rem))]',

          'animate-in zoom-in-95 duration-200'

        )}

        onClick={(e) => e.stopPropagation()}

      >

        <div className="bg-[#36606F] px-4 py-3 text-white shrink-0 flex items-center gap-1">

          <div className="min-w-0 flex-1">

            <p className="text-[10px] font-black uppercase tracking-widest text-white/80">Pedido</p>

            <h3 className="text-base font-black truncate">

              {encargoTime} · {encargoName}

            </h3>

          </div>

          <button

            type="button"

            onClick={() => void handlePrint()}

            disabled={items.length === 0 || printBusy}

            className="shrink-0 min-h-12 min-w-12 flex items-center justify-center rounded-xl hover:bg-white/10 disabled:opacity-40"

            aria-label="Imprimir pedido"

          >

            {printBusy ? (

              <Loader2 size={18} strokeWidth={2.5} className="animate-spin" />

            ) : (

              <Printer size={18} strokeWidth={2.5} />

            )}

          </button>

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



        <div ref={tableRef} className="flex-1 overflow-y-auto min-h-0 px-4 py-3">

          {items.length === 0 ? (

            <p className="py-10 text-center text-xs font-semibold text-zinc-500">

              Sin productos en el pedido.

            </p>

          ) : (

            <div className="overflow-x-auto border border-zinc-100 rounded-xl">

              <table className="w-full table-auto text-left text-[12px]">

                <colgroup>

                  <col className="w-auto" />

                  <col className="w-auto" />

                  <col className="w-px" />

                </colgroup>

                <thead>

                  <tr className="border-b border-zinc-100 bg-zinc-50">

                    <th className="px-3 py-2.5 font-black uppercase text-[9px] tracking-wider text-zinc-500 whitespace-nowrap">

                      Producto

                    </th>

                    <th className="px-3 py-2.5 text-left whitespace-nowrap" aria-hidden="true">

                      &nbsp;

                    </th>

                    <th className="px-3 py-2.5 font-black uppercase text-[9px] tracking-wider text-zinc-500 w-px text-center whitespace-nowrap">

                      Cantidad

                    </th>

                  </tr>

                </thead>

                <tbody>

                  {items.map((it, index) => {

                    const note = it.notes?.trim()

                    return (

                      <tr key={`${it.product_id}-${index}`} className="border-t border-zinc-100">

                        <td className="px-3 py-2.5 font-bold text-zinc-800 align-middle whitespace-nowrap w-auto">

                          {it.name}

                        </td>

                        <td className="px-3 py-2.5 text-left align-middle text-[14px] font-semibold text-zinc-600 lowercase whitespace-nowrap w-auto">

                          {note || ' '}

                        </td>

                        <td className="px-3 py-2.5 font-mono font-bold text-zinc-700 text-center tabular-nums align-middle w-px whitespace-nowrap">

                          {it.quantity > 0 ? it.quantity : ' '}

                        </td>

                      </tr>

                    )

                  })}

                </tbody>

              </table>

            </div>

          )}

        </div>

      </div>

    </div>

  )

}


