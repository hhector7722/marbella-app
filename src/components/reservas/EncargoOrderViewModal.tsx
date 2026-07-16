'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import { Copy, Link2, Loader2, MessageCircle, Pencil, Printer, RotateCcw, X } from 'lucide-react'
import { toast } from 'sonner'

import type { EventOrderItem } from '@/app/dashboard/eventos/[eventId]/pedidos/PedidosEventoClient'
import {
  enableEventClientEditAction,
  reopenClientOrderAction,
} from '@/app/dashboard/eventos/actions'
import {
  buildClientPedidoUrl,
  clientPedidoWhatsAppText,
  formatWhatsAppPhone,
} from '@/lib/client-pedido-link'
import { isClientOrderSubmitted } from '@/lib/reservas-encargos-calendar'
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
  eventId,
  encargoName,
  encargoDate,
  encargoTime,
  contactPhone,
  guestCount = null,
  items,
  clientEditEnabled = false,
  clientEditToken = null,
  clientOrderSubmittedAt = null,
  onClose,
  onEdit,
  onClientLinkReady,
}: {
  eventId: string
  encargoName: string
  encargoDate: string
  encargoTime: string
  contactPhone?: string | null
  guestCount?: number | null
  items: EventOrderItem[]
  clientEditEnabled?: boolean
  clientEditToken?: string | null
  clientOrderSubmittedAt?: string | null
  onClose: () => void
  onEdit: () => void
  onClientLinkReady?: (token: string) => void
}) {
  const tableRef = useRef<HTMLDivElement>(null)
  const [printBusy, setPrintBusy] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [localToken, setLocalToken] = useState<string | null>(clientEditToken)
  const [localEnabled, setLocalEnabled] = useState(clientEditEnabled)
  const [localSubmittedAt, setLocalSubmittedAt] = useState<string | null>(clientOrderSubmittedAt)
  const [reopenConfirmOpen, setReopenConfirmOpen] = useState(false)

  const alreadySubmitted = isClientOrderSubmitted(localSubmittedAt)
  const linkOpen = localEnabled && !alreadySubmitted

  useModalUsageTracking({
    open: true,
    usageId: 'encargo-order-view',
    usageLabel: 'Ver pedido encargo',
  })

  const getClientUrl = useCallback(() => {
    const token = localToken
    if (!token) return null
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return buildClientPedidoUrl(token, origin)
  }, [localToken])

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

  const handleEnableClientEdit = useCallback(() => {
    startTransition(async () => {
      const res = await enableEventClientEditAction({ eventId })
      if (!res.success) {
        toast.error(res.message)
        return
      }
      setLocalToken(res.clientEditToken)
      setLocalEnabled(true)
      onClientLinkReady?.(res.clientEditToken)
      toast.success('Enlace cliente activado')
    })
  }, [eventId, onClientLinkReady])

  const handleConfirmReopen = useCallback(() => {
    startTransition(async () => {
      const res = await reopenClientOrderAction({ eventId })
      if (!res.success) {
        toast.error(res.message)
        return
      }
      setLocalToken(res.clientEditToken)
      setLocalEnabled(true)
      setLocalSubmittedAt(null)
      setReopenConfirmOpen(false)
      onClientLinkReady?.(res.clientEditToken)
      toast.success('Pedido reabierto al cliente — el pedido actual se mantiene hasta un nuevo envío')
    })
  }, [eventId, onClientLinkReady])

  const handleCopyLink = useCallback(async () => {
    const url = getClientUrl()
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Enlace copiado')
    } catch {
      toast.error('No se pudo copiar')
    }
  }, [getClientUrl])

  const handleWhatsApp = useCallback(() => {
    const url = getClientUrl()
    if (!url) return
    const phone = formatWhatsAppPhone(contactPhone ?? '')
    if (!phone) {
      toast.error('Sin teléfono para WhatsApp')
      return
    }
    const text = encodeURIComponent(
      clientPedidoWhatsAppText({
        customerName: encargoName,
        pedidoUrl: url,
        eventDate: encargoDate,
        eventTime: encargoTime,
        guestCount,
      })
    )
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank', 'noopener,noreferrer')
  }, [getClientUrl, contactPhone, encargoName, encargoDate, encargoTime, guestCount])

  return (
    <div
      className="fixed inset-0 z-[10060] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !reopenConfirmOpen) onClose()
      }}
      role="presentation"
    >
      <div
        className={cn(
          'bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden',
          'w-[min(26rem,calc(100vw-3rem))]',
          'max-h-[min(34rem,calc(100dvh-4rem))]',
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
                        <td className="px-3 py-2.5 font-bold text-zinc-800 align-middle whitespace-nowrap">
                          {it.name}
                        </td>
                        <td className="px-3 py-2.5 text-left align-middle text-[14px] font-semibold text-zinc-600 lowercase whitespace-nowrap">
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

        <div className="shrink-0 border-t border-zinc-100 px-4 py-3 space-y-2">
          {alreadySubmitted ? (
            <>
              <p className="text-[11px] font-semibold leading-snug text-zinc-500">
                El cliente ya envió este pedido. El enlace está cerrado. Solo el personal puede
                editarlo.
              </p>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setReopenConfirmOpen(true)}
                className="w-full min-h-12 rounded-xl border border-amber-200 bg-amber-50 text-[11px] font-black uppercase tracking-wider text-amber-900 disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                <RotateCcw className="h-4 w-4" strokeWidth={2.5} />
                Reabrir pedido al cliente
              </button>
            </>
          ) : linkOpen && localToken ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void handleCopyLink()}
                className="min-h-12 rounded-xl bg-zinc-100 text-[11px] font-black uppercase tracking-wider text-zinc-800 inline-flex items-center justify-center gap-1.5"
              >
                <Copy className="h-3.5 w-3.5" strokeWidth={2.5} />
                Copiar enlace
              </button>
              <button
                type="button"
                onClick={handleWhatsApp}
                disabled={!formatWhatsAppPhone(contactPhone ?? '')}
                className="min-h-12 rounded-xl bg-emerald-500 text-[11px] font-black uppercase tracking-wider text-white disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
              >
                <MessageCircle className="h-3.5 w-3.5" strokeWidth={2.5} />
                WhatsApp
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={isPending}
              onClick={handleEnableClientEdit}
              className="w-full min-h-12 rounded-xl border border-zinc-200 bg-white text-[11px] font-black uppercase tracking-wider text-[#36606F] disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4" strokeWidth={2.5} />
              )}
              Permitir edición cliente
            </button>
          )}
        </div>
      </div>

      {reopenConfirmOpen ? (
        <div
          className="fixed inset-0 z-[10080] flex items-center justify-center p-4 bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPending) setReopenConfirmOpen(false)
          }}
          role="presentation"
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-zinc-100 overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="reopen-client-order-title"
            aria-modal="true"
          >
            <div className="px-4 pt-4 pb-2">
              <h4
                id="reopen-client-order-title"
                className="text-base font-black text-zinc-900"
              >
                Reabrir pedido al cliente
              </h4>
              <div className="mt-3 space-y-2 text-[13px] font-semibold leading-snug text-zinc-600">
                <p>El cliente ya ha enviado un pedido.</p>
                <p>Al reabrir el pedido:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>volverá a poder acceder a la carta mediante el mismo enlace</li>
                  <li>podrá preparar un nuevo pedido</li>
                  <li>
                    cuando vuelva a pulsar &quot;Enviar pedido&quot;, el pedido actual será
                    sustituido completamente por el nuevo
                  </li>
                </ul>
                <p className="pt-1 text-zinc-800">Esta acción no puede deshacerse.</p>
              </div>
            </div>
            <div className="shrink-0 grid grid-cols-2 gap-2 p-4 pt-3">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setReopenConfirmOpen(false)}
                className="min-h-12 rounded-xl border border-zinc-200 bg-white text-[12px] font-black uppercase tracking-wider text-zinc-700 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={handleConfirmReopen}
                className="min-h-12 rounded-xl bg-amber-600 text-[12px] font-black uppercase tracking-wider text-white disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Reabrir pedido
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
