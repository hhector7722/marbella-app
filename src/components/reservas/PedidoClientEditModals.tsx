'use client'

import { Copy, Loader2, MessageCircle, User, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import { useCallback, useState } from 'react'

import {
  buildClientPedidoUrl,
  clientPedidoWhatsAppText,
  formatWhatsAppPhone,
} from '@/lib/client-pedido-link'
import { cn } from '@/lib/utils'
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking'

export function PedidoEditorChoiceModal({
  busy,
  onClose,
  onChooseStaff,
  onChooseClient,
}: {
  busy?: boolean
  onClose: () => void
  onChooseStaff: () => void
  onChooseClient: () => void
}) {
  useModalUsageTracking({
    open: true,
    usageId: 'pedido-editor-choice',
    usageLabel: 'Quién introduce el pedido',
  })

  return (
    <div
      className="fixed inset-0 z-[10070] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
      role="presentation"
    >
      <div
        className={cn(
          'bg-white w-full max-w-sm flex flex-col overflow-hidden rounded-2xl',
          'max-h-[calc(100dvh-2rem)] shadow-2xl border border-zinc-100'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#36606F] px-4 py-3 flex items-center justify-between text-white shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/80">Pedido</p>
            <h3 className="text-sm font-black uppercase tracking-wide">¿Quién lo introduce?</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-12 min-w-12 flex items-center justify-center rounded-xl hover:bg-white/10 disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <button
            type="button"
            disabled={busy}
            onClick={onChooseStaff}
            className="w-full min-h-14 rounded-xl border border-zinc-100 bg-white px-4 py-3 text-left active:bg-zinc-50 disabled:opacity-50"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#36606F]/10 text-[#36606F]">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <User className="h-5 w-5" strokeWidth={2.25} />}
              </span>
              <span>
                <span className="block text-sm font-black text-zinc-900">Lo introduciré yo</span>
                <span className="mt-0.5 block text-xs font-semibold text-zinc-500">
                  Editor rápido sin fotos
                </span>
              </span>
            </span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={onChooseClient}
            className="w-full min-h-14 rounded-xl border border-zinc-100 bg-white px-4 py-3 text-left active:bg-zinc-50 disabled:opacity-50"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <Users className="h-5 w-5" strokeWidth={2.25} />
              </span>
              <span>
                <span className="block text-sm font-black text-zinc-900">Lo introducirá el cliente</span>
                <span className="mt-0.5 block text-xs font-semibold text-zinc-500">
                  Enlace privado con carta y fotos
                </span>
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

export function ClientPedidoShareModal({
  customerName,
  customerPhone,
  clientEditToken,
  eventDate,
  eventTime,
  guestCount,
  onClose,
  onDone,
}: {
  customerName: string
  customerPhone?: string | null
  clientEditToken: string
  eventDate?: string | null
  eventTime?: string | null
  guestCount?: number | null
  onClose: () => void
  onDone?: () => void
}) {
  const [busy, setBusy] = useState(false)

  useModalUsageTracking({
    open: true,
    usageId: 'pedido-client-share',
    usageLabel: 'Compartir enlace pedido',
  })

  const getUrl = useCallback(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return buildClientPedidoUrl(clientEditToken, origin)
  }, [clientEditToken])

  const handleCopy = useCallback(async () => {
    setBusy(true)
    try {
      await navigator.clipboard.writeText(getUrl())
      toast.success('Enlace copiado')
    } catch {
      toast.error('No se pudo copiar')
    } finally {
      setBusy(false)
    }
  }, [getUrl])

  const handleWhatsApp = useCallback(() => {
    const phone = formatWhatsAppPhone(customerPhone ?? '')
    if (!phone) {
      toast.error('Sin teléfono para WhatsApp')
      return
    }
    const text = encodeURIComponent(
      clientPedidoWhatsAppText({
        customerName,
        pedidoUrl: getUrl(),
        eventDate,
        eventTime,
        guestCount,
      })
    )
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank', 'noopener,noreferrer')
  }, [customerName, customerPhone, getUrl, eventDate, eventTime, guestCount])

  return (
    <div
      className="fixed inset-0 z-[10080] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="presentation"
    >
      <div
        className={cn(
          'bg-white w-full max-w-sm flex flex-col overflow-hidden rounded-2xl',
          'max-h-[calc(100dvh-2rem)] shadow-2xl border border-zinc-100'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#36606F] px-4 py-3 flex items-center justify-between text-white shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/80">Enlace cliente</p>
            <h3 className="text-sm font-black truncate">{customerName}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 min-w-12 flex items-center justify-center rounded-xl hover:bg-white/10"
            aria-label="Cerrar"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs font-semibold text-zinc-600 leading-relaxed">
            El cliente rellena el pedido una sola vez con la carta. Tras enviarlo, el enlace se
            cierra; solo el personal podrá modificarlo después.
          </p>

          <button
            type="button"
            disabled={busy}
            onClick={() => void handleCopy()}
            className="w-full min-h-12 rounded-xl bg-zinc-100 text-[12px] font-black uppercase tracking-wider text-zinc-800 active:opacity-80 disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            <Copy className="h-4 w-4" strokeWidth={2.5} />
            Copiar enlace
          </button>

          <button
            type="button"
            onClick={handleWhatsApp}
            disabled={!formatWhatsAppPhone(customerPhone ?? '')}
            className="w-full min-h-12 rounded-xl bg-emerald-500 text-[12px] font-black uppercase tracking-wider text-white hover:bg-emerald-600 disabled:opacity-40 inline-flex items-center justify-center gap-2"
          >
            <MessageCircle className="h-4 w-4" strokeWidth={2.5} />
            Enviar WhatsApp
          </button>

          <button
            type="button"
            onClick={() => {
              onDone?.()
              onClose()
            }}
            className="w-full min-h-12 rounded-xl bg-[#36606F] text-[12px] font-black uppercase tracking-wider text-white"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  )
}
