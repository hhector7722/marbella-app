'use client'

import { Copy, Loader2, User, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useCallback, useState } from 'react'

import {
  buildClientPedidoUrl,
  clientPedidoWhatsAppText,
  formatWhatsAppPhone,
} from '@/lib/client-pedido-link'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'

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
  return (
    <Modal
      open
      onClose={() => { if (!busy) onClose() }}
      variant="compact"
      layer="base"
      instance="pedido-editor-choice"
      title="¿Quién lo introduce?"
      subtitle="Pedido"
      headerTone="petroleum"
      closeOnBackdrop={!busy}
    >
      <div className="space-y-3">
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
    </Modal>
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
    <Modal
      open
      onClose={onClose}
      variant="compact"
      layer="derived"
      instance="pedido-client-share"
      parentInstance="pedido-editor-choice"
      title={customerName}
      subtitle="Enlace cliente"
      headerTone="petroleum"
    >
      <div className="space-y-3">
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

        <Button
          type="button"
          variant="primary"
          instance="pedido-client-send-whatsapp"
          onClick={handleWhatsApp}
          disabled={!formatWhatsAppPhone(customerPhone ?? '')}
          className="w-full"
        >
          Enviar WhatsApp
        </Button>

        <Button
          type="button"
          variant="primary"
          instance="pedido-client-listo"
          onClick={() => {
            onDone?.()
            onClose()
          }}
          className="w-full"
        >
          Listo
        </Button>
      </div>
    </Modal>
  )
}
