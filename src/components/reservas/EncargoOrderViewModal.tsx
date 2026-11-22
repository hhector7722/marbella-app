'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Loader2, Pencil, Printer, Receipt } from 'lucide-react'
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
import { formatCartaOrderProductName } from '@/lib/carta-menu-i18n'
import {
  formatEncargoProductLabel,
  formatEncargoProductNote,
} from '@/lib/encargo-staff-helpers'
import { isDrinkConsumptionRecipe } from '@/lib/staff-consumption-display'
import { KITCHEN_PRINTERS, type KitchenPrinterId, type TicketPrintLine } from '@/lib/reservas/kitchen-ticket-layout'
import { createClient } from '@/utils/supabase/client'
import {
  createEncargoPdfPreviewWindow,
  generateEncargoPdf,
  openEncargoPdf,
  type EncargoDocumentLanguage,
  type EncargoInvoiceCustomer,
} from '@/lib/reservas/encargo-pdf'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/Field'
import { EmptyState } from '@/components/ui/EmptyState'
import { TABLE_COMPONENT_ID } from '@/lib/design-system'

function formatEncargoPrintDate(ymd: string) {
  const parts = ymd.slice(0, 10).split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return ymd
  const [y, m, d] = parts
  return `${d}/${String(m).padStart(2, '0')}/${String(y % 100).padStart(2, '0')}`
}

type ComandaSelection = 'food' | 'drink' | 'all'

/**
 * Clasifica cada línea con el catálogo real para imprimir exclusivamente la
 * comida o la bebida solicitada. «Todo» conserva el pedido original sin consulta.
 * Si falla el catálogo, no se imprime por error una comanda mezclada.
 */
async function filterComandaItems(
  items: EventOrderItem[],
  selection: ComandaSelection,
): Promise<EventOrderItem[]> {
  if (selection === 'all' || items.length === 0) return items

  const productIds = Array.from(new Set(items.map((item) => item.product_id)))
  const supabase = createClient()
  const { data, error } = await supabase
    .from('event_products')
    .select('product_id, name, category')
    .in('product_id', productIds)

  if (error || !data) {
    throw new Error('No se pudieron consultar las categorías de los productos.')
  }

  const catalog = new Map(data.map((row) => [row.product_id, row]))
  if (productIds.some((id) => !catalog.has(id))) {
    throw new Error('Hay productos sin categoría de catálogo. No se puede separar la comanda.')
  }

  return items.filter((item) => {
    const row = catalog.get(item.product_id)!
    const name = row.name || item.name
    const isDrink = isDrinkConsumptionRecipe({ name, category: row.category })
      || /begud|cafeter|còctel|coctel|cocktail|licor/i.test(row.category ?? '')
      || /\b(aigua|aquarius|juver|bitter|schweppes|trina|pepsi|monster|gaseosa|batido|granini|cava|vermut)\b/i.test(name)
    return isDrink === (selection === 'drink')
  })
}

type InvoiceStep = 'question' | 'number' | 'customer' | null

function emptyInvoiceCustomer(): EncargoInvoiceCustomer {
  return { businessName: '', nif: '', address: '', postalCode: '', province: '', country: '' }
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
  const thermalRequestKeyRef = useRef<string | null>(null)
  const invoicePreviewUrlRef = useRef<string | null>(null)
  const [invoicePreview, setInvoicePreview] = useState<{ url: string; filename: string } | null>(null)
  useEffect(() => () => {
    // No dejar URLs de PDF vivas al desmontar el pedido.
    if (invoicePreviewUrlRef.current) URL.revokeObjectURL(invoicePreviewUrlRef.current)
  }, [])
  const [printBusy, setPrintBusy] = useState(false)
  const [invoiceBusy, setInvoiceBusy] = useState(false)
  const [comandaBusy, setComandaBusy] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [localToken, setLocalToken] = useState<string | null>(clientEditToken)
  const [localEnabled, setLocalEnabled] = useState(clientEditEnabled)
  const [localSubmittedAt, setLocalSubmittedAt] = useState<string | null>(clientOrderSubmittedAt)
  const [reopenConfirmOpen, setReopenConfirmOpen] = useState(false)
  const [printLanguageFor, setPrintLanguageFor] = useState<'quote' | 'invoice' | 'comanda' | null>(null)
  const [invoiceLanguage, setInvoiceLanguage] = useState<EncargoDocumentLanguage | null>(null)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceStep, setInvoiceStep] = useState<InvoiceStep>(null)
  const [invoiceCustomer, setInvoiceCustomer] = useState<EncargoInvoiceCustomer>(emptyInvoiceCustomer)
  const [comandaLanguage, setComandaLanguage] = useState<EncargoDocumentLanguage | null>(null)
  const [comandaObservations, setComandaObservations] = useState('')
  const [thermalPrinter, setThermalPrinter] = useState<KitchenPrinterId>('kitchen')
  const [thermalPreview, setThermalPreview] = useState<{
    layout: TicketPrintLine[]
    previewHash: string
    language: EncargoDocumentLanguage
    observations: string
  } | null>(null)
  const [documentTypeOpen, setDocumentTypeOpen] = useState(false)
  const [comandaTypeOpen, setComandaTypeOpen] = useState(false)
  const [comandaSelection, setComandaSelection] = useState<ComandaSelection>('all')

  const alreadySubmitted = isClientOrderSubmitted(localSubmittedAt)
  const linkOpen = localEnabled && !alreadySubmitted


  const getClientUrl = useCallback(() => {
    const token = localToken
    if (!token) return null
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return buildClientPedidoUrl(token, origin)
  }, [localToken])

  const handlePrint = useCallback(async (
    language: EncargoDocumentLanguage,
    previewWindow?: Window | null
  ) => {
    if (printBusy || items.length === 0) return
    setPrintBusy(true)
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const pdf = await generateEncargoPdf(
        'quote',
        {
          encargoDate: formatEncargoPrintDate(encargoDate),
          encargoTime,
          encargoName,
          contactPhone: contactPhone ?? null,
          guestCount,
          logoUrl: `${origin}/icons/logo-white.png`,
          language,
        },
        items
      )
      openEncargoPdf(pdf, previewWindow)
    } catch (error) {
      try {
        previewWindow?.close()
      } catch {
        // La pestaña puede haber sido cerrada por el usuario.
      }
      console.error('encargo quote pdf failed', error)
      toast.error('No se pudo generar el presupuesto PDF.')
    } finally {
      setPrintBusy(false)
    }
  }, [printBusy, encargoName, encargoDate, encargoTime, contactPhone, guestCount, items])

  const handlePrintInvoice = useCallback(async (
    language: EncargoDocumentLanguage,
    invoiceNumberValue: string,
    customer: EncargoInvoiceCustomer | null,
    previewWindow?: Window | null
  ) => {
    if (invoiceBusy || items.length === 0) return
    setInvoiceBusy(true)
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const pdf = await generateEncargoPdf(
        'invoice',
        {
          encargoDate: formatEncargoPrintDate(encargoDate),
          encargoTime,
          encargoName,
          contactPhone: contactPhone ?? null,
          guestCount,
          logoUrl: `${origin}/icons/logo-white.png`,
          language,
          invoiceNumber: invoiceNumberValue.trim() || null,
          invoiceCustomer: customer,
        },
        items
      )
      if (previewWindow && !previewWindow.closed) {
        // Mismo flujo que el presupuesto: ventana abierta directamente
        // con el clic, navegación al PDF una vez se ha generado.
        openEncargoPdf(pdf, previewWindow)
        setInvoiceLanguage(null)
        setInvoiceStep(null)
        setInvoiceNumber('')
        setInvoiceCustomer(emptyInvoiceCustomer())
      } else {
        // Si el navegador bloquea ventanas emergentes, ofrecer el PDF
        // dentro de la app para que jamás se pierda el documento.
        const url = URL.createObjectURL(pdf.blob)
        if (invoicePreviewUrlRef.current) URL.revokeObjectURL(invoicePreviewUrlRef.current)
        invoicePreviewUrlRef.current = url
        setInvoicePreview({ url, filename: pdf.filename })
      }
    } catch (error) {
      try {
        previewWindow?.close()
      } catch {
        // La pestaña puede haber sido cerrada manualmente.
      }
      console.error('encargo invoice pdf failed', error)
      toast.error('No se pudo generar la factura PDF.')
    } finally {
      setInvoiceBusy(false)
    }
  }, [invoiceBusy, encargoName, encargoDate, encargoTime, contactPhone, guestCount, items])

  const handlePrintComanda = useCallback(async (
    language: EncargoDocumentLanguage,
    observations: string,
    previewWindow?: Window | null
  ) => {
    if (comandaBusy || items.length === 0) return
    setComandaBusy(true)
    try {
      const comandaItems = await filterComandaItems(items, comandaSelection)
      if (comandaItems.length === 0) {
        try {
          previewWindow?.close()
        } catch {
          // La pestaña puede haber sido cerrada por el usuario.
        }
        toast.error(comandaSelection === 'drink'
          ? 'No hay bebidas en este pedido.'
          : 'No hay comida en este pedido.')
        return
      }
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const pdf = await generateEncargoPdf(
        'comanda',
        {
          encargoDate: formatEncargoPrintDate(encargoDate),
          encargoTime,
          encargoName,
          contactPhone: contactPhone ?? null,
          guestCount,
          logoUrl: `${origin}/icons/logo-white.png`,
          language,
          observations: observations.trim() || null,
        },
        comandaItems
      )
      openEncargoPdf(pdf, previewWindow)
    } catch (error) {
      try {
        previewWindow?.close()
      } catch {
        // La pestaña puede haber sido cerrada por el usuario.
      }
      console.error('encargo comanda pdf failed', error)
      toast.error(error instanceof Error && error.message.startsWith('No se ')
        ? error.message
        : error instanceof Error && error.message.startsWith('Hay productos ')
          ? error.message
          : 'No se pudo generar la comanda PDF.')
    } finally {
      setComandaBusy(false)
    }
  }, [comandaBusy, comandaSelection, encargoName, encargoDate, encargoTime, contactPhone, guestCount, items])

  const handlePrintLanguage = useCallback(
    (language: EncargoDocumentLanguage) => {
      const target = printLanguageFor
      if (!target) return

      setPrintLanguageFor(null)

      if (target === 'quote') {
        // Abrir la pestaña dentro del gesto del usuario evita el bloqueo de popups en Safari iOS.
        const previewWindow = createEncargoPdfPreviewWindow()
        void handlePrint(language, previewWindow)
      } else if (target === 'comanda') {
        setComandaLanguage(language)
        setComandaObservations('')
      } else {
        setInvoiceLanguage(language)
        setInvoiceNumber('')
        setInvoiceCustomer(emptyInvoiceCustomer())
        setInvoiceStep('question')
      }
    },
    [printLanguageFor, handlePrint]
  )

  const closeInvoiceFlow = useCallback(() => {
    setInvoiceLanguage(null)
    setInvoiceStep(null)
    setInvoiceNumber('')
    setInvoiceCustomer(emptyInvoiceCustomer())
  }, [])

  const closeInvoicePreview = useCallback(() => {
    setInvoicePreview(null)
    closeInvoiceFlow()
    const url = invoicePreviewUrlRef.current
    invoicePreviewUrlRef.current = null
    // Mantener el enlace unos minutos para permitir aperturas o descargas
    // desde los controles antes de liberar la URL del PDF.
    if (url) window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000)
  }, [closeInvoiceFlow])

  const downloadInvoicePreview = useCallback(() => {
    if (!invoicePreview) return
    const anchor = document.createElement('a')
    anchor.href = invoicePreview.url
    anchor.download = invoicePreview.filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  }, [invoicePreview])

  const handleGenerateInvoice = useCallback(() => {
    if (!invoiceLanguage || invoiceBusy || invoicePreview) return
    // Igual que el presupuesto: abrir la pestaña inmediatamente dentro
    // del clic evita el bloqueo de Safari/iOS y navegadores de escritorio.
    const previewWindow = createEncargoPdfPreviewWindow()
    const language = invoiceLanguage
    const number = invoiceNumber
    const customer = invoiceStep === 'customer' ? { ...invoiceCustomer } : null
    void handlePrintInvoice(language, number, customer, previewWindow)
  }, [invoiceLanguage, invoiceNumber, invoiceStep, invoiceCustomer, invoiceBusy, invoicePreview, handlePrintInvoice])

  const handleGenerateComanda = useCallback(() => {
    if (!comandaLanguage || comandaBusy) return
    // Abrir la pestaña dentro del gesto del usuario evita el bloqueo de popups en Safari iOS.
    const previewWindow = createEncargoPdfPreviewWindow()
    const language = comandaLanguage
    const observations = comandaObservations
    setComandaLanguage(null)
    setComandaObservations('')
    void handlePrintComanda(language, observations, previewWindow)
  }, [comandaLanguage, comandaObservations, comandaBusy, handlePrintComanda])

  const handlePreviewThermalComanda = useCallback(async () => {
    if (!comandaLanguage || comandaBusy || !items.length) return
    setComandaBusy(true)
    try {
      const response = await fetch('/api/reservas/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          requestKey: crypto.randomUUID(),
          selection: comandaSelection,
          language: comandaLanguage,
          observations: comandaObservations,
          previewOnly: true,
        }),
      })
      const result = await response.json()
      if (!response.ok || !Array.isArray(result.layout) || !result.previewHash) {
        throw new Error(result?.error || 'No se pudo previsualizar la comanda')
      }
      setThermalPreview({
        layout: result.layout as TicketPrintLine[],
        previewHash: String(result.previewHash),
        language: comandaLanguage,
        observations: comandaObservations,
      })
      setComandaLanguage(null)
      thermalRequestKeyRef.current = null
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo generar la previsualización')
    } finally {
      setComandaBusy(false)
    }
  }, [comandaLanguage, comandaBusy, items.length, eventId, comandaSelection, comandaObservations])

  const handleSendThermalComanda = useCallback(async () => {
    if (!thermalPreview || comandaBusy) return
    setComandaBusy(true)
    const printerLabel = KITCHEN_PRINTERS.find((printer) => printer.id === thermalPrinter)?.label ?? 'impresora'
    try {
      const requestKey = thermalRequestKeyRef.current ?? crypto.randomUUID()
      thermalRequestKeyRef.current = requestKey
      const response = await fetch('/api/reservas/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          requestKey,
          selection: comandaSelection,
          language: thermalPreview.language,
          observations: thermalPreview.observations,
          expectedPreviewHash: thermalPreview.previewHash,
          printerId: thermalPrinter,
        }),
      })
      const result = await response.json()
      if (!response.ok || !result?.job?.id) {
        throw new Error(result?.error || 'No se pudo enviar la comanda a la impresora')
      }
      thermalRequestKeyRef.current = null
      setThermalPreview(null)
      setComandaObservations('')
      toast.message('Comanda en cola: ' + printerLabel)
      const id = String(result.job.id)
      void (async () => {
        for (let attempt = 0; attempt < 24; attempt++) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 3000))
          try {
            const statusResponse = await fetch('/api/reservas/print?id=' + encodeURIComponent(id), {
              cache: 'no-store',
            })
            if (!statusResponse.ok) continue
            const status = await statusResponse.json()
            if (status.status === 'sent') {
              toast.success('Comanda enviada a ' + printerLabel)
              return
            }
            if (status.status === 'failed') {
              toast.error('No se pudo enviar a ' + printerLabel + ': ' + (status.error || 'impresora no disponible'))
              return
            }
          } catch {
            // La conexión puede fallar temporalmente sin perder el trabajo.
          }
        }
        toast.warning('Sin confirmación de ' + printerLabel + '. Revisa el ticket antes de reenviar.')
      })()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo enviar la comanda')
    } finally {
      setComandaBusy(false)
    }
  }, [thermalPreview, comandaBusy, thermalPrinter, eventId, comandaSelection])

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
    <>
      <Modal
        open
        onClose={() => { if (!reopenConfirmOpen) onClose() }}
        variant="compact"
        layer="base"
        instance="encargo-order-view"
        title={`${encargoTime} · ${encargoName}`}
        subtitle="Pedido"
        closeOnBackdrop={!reopenConfirmOpen}
        headerTrailing={
          <>
            <button
              type="button"
              onClick={() => setComandaTypeOpen(true)}
              disabled={items.length === 0 || comandaBusy}
              className="relative flex h-full max-h-full min-h-0 w-[var(--modal-header-height)] shrink-0 items-center justify-center border-0 bg-transparent text-zinc-700 shadow-none outline-none hover:bg-zinc-100 disabled:opacity-40 active:opacity-70 before:absolute before:inset-0 before:-m-[6px] before:min-h-12 before:min-w-12 before:content-['']"
              aria-label="Imprimir comanda PDF"
            >
              {comandaBusy ? (
                <Loader2 size={18} strokeWidth={2.5} className="animate-spin" />
              ) : (
                <Printer size={18} strokeWidth={2.5} />
              )}
            </button>
            <button
              type="button"
              onClick={() => setDocumentTypeOpen(true)}
              disabled={items.length === 0 || printBusy || invoiceBusy}
              className="relative flex h-full max-h-full min-h-0 w-[var(--modal-header-height)] shrink-0 items-center justify-center border-0 bg-transparent text-zinc-700 shadow-none outline-none hover:bg-zinc-100 disabled:opacity-40 active:opacity-70 before:absolute before:inset-0 before:-m-[6px] before:min-h-12 before:min-w-12 before:content-['']"
              aria-label="Generar presupuesto o factura PDF"
            >
              {printBusy || invoiceBusy ? (
                <Loader2 size={18} strokeWidth={2.5} className="animate-spin" />
              ) : (
                <Receipt size={18} strokeWidth={2.5} />
              )}
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="relative flex h-full max-h-full min-h-0 w-[var(--modal-header-height)] shrink-0 items-center justify-center border-0 bg-transparent text-zinc-700 shadow-none outline-none hover:bg-zinc-100 active:opacity-70 before:absolute before:inset-0 before:-m-[6px] before:min-h-12 before:min-w-12 before:content-['']"
              aria-label="Editar encargo"
            >
              <Pencil size={18} strokeWidth={2.5} />
            </button>
          </>
        }
        footer={
          alreadySubmitted ? (
            <Button
              type="button"
              variant="primary"
              instance="encargo-order-reopen"
              disabled={isPending}
              onClick={() => setReopenConfirmOpen(true)}
            >
              Reabrir pedido al cliente
            </Button>
          ) : linkOpen && localToken ? (
            <>
              <Button
                type="button"
                variant="secondary"
                instance="encargo-order-copy-link"
                onClick={() => void handleCopyLink()}
              >
                Copiar enlace
              </Button>
              <Button
                type="button"
                variant="primary"
                instance="encargo-order-whatsapp"
                onClick={handleWhatsApp}
                disabled={!formatWhatsAppPhone(contactPhone ?? '')}
              >
                WhatsApp
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="primary"
              instance="encargo-order-enable-client-edit"
              disabled={isPending}
              loading={isPending}
              loadingLabel="Permitir edición cliente"
              onClick={handleEnableClientEdit}
            >
              Permitir edición cliente
            </Button>
          )
        }
      >
        <div ref={tableRef} className="flex-1 overflow-y-auto min-h-0 py-3">
          {items.length === 0 ? (
            <EmptyState
              instance="encargo-order-empty"
              variant="none"
              title="Sin productos en el pedido"
            />
          ) : (
            <div className="overflow-x-auto border border-zinc-100 rounded-xl">
              <table data-component={TABLE_COMPONENT_ID} data-instance="encargo-order-items" className="w-full table-auto text-left">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th aria-hidden="true">&nbsp;</th>
                    <th className="text-center">Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, index) => {
                    const productLabel = formatEncargoProductLabel(it.name, it.notes)
                    const note = formatEncargoProductNote(it.name, it.notes)
                    return (
                      <tr key={`${it.product_id}-${index}`} className="border-t border-zinc-100">
                        <td className="px-3 py-2.5 font-normal text-zinc-800 align-middle whitespace-nowrap">
                          {formatCartaOrderProductName(productLabel)}
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

          {alreadySubmitted ? (
            <p className="pt-3 text-[11px] font-semibold leading-snug text-zinc-500">
              El cliente ya envió este pedido. El enlace está cerrado. Solo el personal puede
              editarlo.
            </p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={comandaTypeOpen}
        onClose={() => setComandaTypeOpen(false)}
        variant="compact"
        layer="derived"
        instance="encargo-comanda-type"
        parentInstance="encargo-order-view"
        title="¿Qué comanda quieres imprimir?"
      >
        <div className="grid gap-2 py-1">
          {([
            ['food', 'Comida'],
            ['drink', 'Bebida'],
            ['all', 'Todo'],
          ] as const).map(([selection, label]) => (
            <button
              key={selection}
              type="button"
              onClick={() => {
                setComandaSelection(selection)
                setComandaTypeOpen(false)
                setPrintLanguageFor('comanda')
              }}
              className="min-h-12 w-full rounded-xl border border-zinc-100 bg-white px-4 text-left text-sm font-bold text-zinc-800 transition-colors hover:bg-zinc-50 active:bg-zinc-100"
            >
              {label}
            </button>
          ))}
        </div>
      </Modal>

      <Modal
        open={documentTypeOpen}
        onClose={() => setDocumentTypeOpen(false)}
        variant="compact"
        layer="derived"
        instance="encargo-document-type"
        parentInstance="encargo-order-view"
        title="¿Qué documento quieres generar?"
      >
        <div className="grid gap-2 py-1">
          {([
            ['quote', 'Presupuesto'],
            ['invoice', 'Factura'],
          ] as const).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              onClick={() => {
                setDocumentTypeOpen(false)
                setPrintLanguageFor(kind)
              }}
              className="min-h-12 w-full rounded-xl border border-zinc-100 bg-white px-4 text-left text-sm font-bold text-zinc-800 transition-colors hover:bg-zinc-50 active:bg-zinc-100"
            >
              {label}
            </button>
          ))}
        </div>
      </Modal>

      <Modal
        open={printLanguageFor !== null}
        onClose={() => {
          if (!printBusy && !invoiceBusy && !comandaBusy) setPrintLanguageFor(null)
        }}
        variant="compact"
        layer="derived"
        instance="encargo-print-language"
        parentInstance="encargo-order-view"
        title={
          printLanguageFor === 'invoice'
            ? 'Idioma de la factura'
            : printLanguageFor === 'comanda'
              ? 'Idioma de la comanda'
              : 'Idioma del presupuesto'
        }
        closeOnBackdrop={!printBusy && !invoiceBusy && !comandaBusy}
      >
        <div className="grid gap-2 py-1">
          {([
            ['ca', 'Català'],
            ['es', 'Español'],
            ['en', 'English'],
          ] as const).map(([language, label]) => (
            <button
              key={language}
              type="button"
              onClick={() => handlePrintLanguage(language)}
              disabled={printBusy || invoiceBusy || comandaBusy}
              className="min-h-12 w-full rounded-xl border border-zinc-100 bg-white px-4 text-left text-sm font-bold text-zinc-800 transition-colors hover:bg-zinc-50 active:bg-zinc-100 disabled:opacity-50"
            >
              {label}
            </button>
          ))}
        </div>
      </Modal>

      <Modal
        open={invoiceLanguage !== null && invoiceStep === 'question'}
        onClose={() => { if (!invoiceBusy) closeInvoiceFlow() }}
        variant="compact"
        layer="derived"
        instance="encargo-invoice-customer-question"
        parentInstance="encargo-order-view"
        title="¿Quieres añadir datos del cliente?"
        closeOnBackdrop={!invoiceBusy}
      >
        <div className="grid grid-cols-2 gap-3 py-2">
          <Button type="button" variant="secondary" instance="encargo-invoice-customer-no"
            disabled={invoiceBusy} onClick={() => setInvoiceStep('number')}>
            No
          </Button>
          <Button type="button" variant="primary" instance="encargo-invoice-customer-yes"
            disabled={invoiceBusy} onClick={() => setInvoiceStep('customer')}>
            Sí
          </Button>
        </div>
      </Modal>

      <Modal
        open={invoiceLanguage !== null && invoiceStep === 'number'}
        onClose={() => { if (!invoiceBusy) closeInvoiceFlow() }}
        variant="compact"
        layer="derived"
        instance="encargo-invoice-number"
        parentInstance="encargo-order-view"
        title="Número de factura"
        closeOnBackdrop={!invoiceBusy}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              instance="encargo-invoice-number-cancel"
              disabled={invoiceBusy}
              onClick={closeInvoiceFlow}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              instance="encargo-invoice-number-generate"
              disabled={invoiceBusy}
              loading={invoiceBusy}
              loadingLabel="Generando factura"
              onClick={handleGenerateInvoice}
            >
              Generar factura
            </Button>
          </>
        }
      >
        <div className="py-2">
          <label
            htmlFor="encargo-invoice-number-input"
            className="mb-2 block text-[12px] font-bold text-zinc-700"
          >
            Número de factura <span className="font-semibold text-zinc-400">(opcional)</span>
          </label>
          <input
            id="encargo-invoice-number-input"
            type="text"
            value={invoiceNumber}
            onChange={(event) => setInvoiceNumber(event.target.value)}
            placeholder="Ej. 2026-001"
            disabled={invoiceBusy}
            autoFocus
            className="min-h-12 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400 disabled:opacity-50"
          />
        </div>
      </Modal>

      <Modal
        open={invoiceLanguage !== null && invoiceStep === 'customer'}
        onClose={() => { if (!invoiceBusy) closeInvoiceFlow() }}
        variant="compact"
        layer="derived"
        instance="encargo-invoice-customer"
        parentInstance="encargo-order-view"
        title="Datos de facturación"
        closeOnBackdrop={!invoiceBusy}
        footer={
          <>
            <Button type="button" variant="secondary" instance="encargo-invoice-customer-cancel"
              disabled={invoiceBusy} onClick={closeInvoiceFlow}>
              Cancelar
            </Button>
            <Button type="button" variant="primary" instance="encargo-invoice-customer-generate"
              disabled={invoiceBusy || !invoiceCustomer.businessName.trim()}
              loading={invoiceBusy} loadingLabel="Generando factura"
              onClick={handleGenerateInvoice}>
              Generar factura
            </Button>
          </>
        }
      >
        <div className="max-h-[65dvh] space-y-3 overflow-y-auto py-2 pr-1">
          <Field instance="encargo-invoice-customer-number" label="Factura nº" htmlFor="encargo-invoice-customer-number-input">
            <input
              id="encargo-invoice-customer-number-input"
              type="text" autoComplete="off"
              value={invoiceNumber}
              onChange={(event) => setInvoiceNumber(event.target.value)}
              placeholder="Ej. 2026-001"
              disabled={invoiceBusy}
              className="min-h-12 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-400"
            />
          </Field>
          {([
            ['businessName', 'Razón social', 'organization'],
            ['nif', 'NIF', 'off'],
            ['address', 'Dirección', 'street-address'],
            ['postalCode', 'Código postal', 'postal-code'],
            ['province', 'Provincia', 'address-level1'],
            ['country', 'País', 'country-name'],
          ] as const).map(([key, label, autoComplete]) => (
            <Field
              key={key}
              instance={'encargo-invoice-customer-' + key}
              label={label}
              htmlFor={'encargo-invoice-customer-' + key + '-input'}
            >
              <input
                id={'encargo-invoice-customer-' + key + '-input'}
                type="text"
                autoComplete={autoComplete}
                value={invoiceCustomer[key]}
                onChange={(event) => setInvoiceCustomer((previous) => ({
                  ...previous,
                  [key]: event.target.value,
                }))}
                disabled={invoiceBusy}
                required={key === 'businessName'}
                maxLength={160}
                className="min-h-12 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-400"
              />
            </Field>
          ))}
        </div>
      </Modal>

      <Modal
        open={invoicePreview !== null}
        onClose={closeInvoicePreview}
        variant="work"
        layer="system"
        instance="encargo-invoice-pdf-preview"
        title="Factura PDF"
        closeOnBackdrop={false}
        scrollContent={false}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              instance="encargo-invoice-preview-close"
              onClick={closeInvoicePreview}
            >
              Cerrar
            </Button>
            <Button
              type="button"
              variant="primary"
              instance="encargo-invoice-preview-download"
              onClick={downloadInvoicePreview}
            >
              Descargar PDF
            </Button>
          </>
        }
      >
        {invoicePreview ? (
          <div className="flex min-h-0 w-full flex-col bg-white">
            <iframe
              key={invoicePreview.url}
              title="Factura PDF"
              src={invoicePreview.url}
              className="h-[min(70dvh,780px)] min-h-[240px] w-full border-0 bg-white"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs text-zinc-600">
              <span>Si tu navegador no muestra el PDF, pulsa Descargar PDF.</span>
              <a
                href={invoicePreview.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[var(--color-envolvente)] underline"
              >
                Abrir en otra pestaña
              </a>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={comandaLanguage !== null}
        onClose={() => {
          if (!comandaBusy) {
            setComandaLanguage(null)
            setComandaObservations('')
          }
        }}
        variant="compact"
        layer="derived"
        instance="encargo-comanda-observations"
        parentInstance="encargo-order-view"
        title={comandaSelection === 'food' ? 'Comanda de comida' : comandaSelection === 'drink' ? 'Comanda de bebida' : 'Comanda completa'}
        closeOnBackdrop={!comandaBusy}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              instance="encargo-comanda-observations-generate"
              disabled={comandaBusy}
              onClick={handleGenerateComanda}
            >
              PDF A4
            </Button>
            <Button
              type="button"
              variant="primary"
              instance="encargo-comanda-observations-thermal"
              disabled={comandaBusy}
              loading={comandaBusy}
              loadingLabel="Preparando ticket"
              onClick={() => void handlePreviewThermalComanda()}
            >
              Previsualizar ticket
            </Button>
          </>
        }
      >
        <div className="py-2">
          <Field
            instance="encargo-comanda-observations-field"
            label="Observaciones"
            htmlFor="encargo-comanda-observations-input"
            hint="Opcional. Si se rellena, aparece al final de la comanda."
          >
            <textarea
              id="encargo-comanda-observations-input"
              value={comandaObservations}
              onChange={(event) => setComandaObservations(event.target.value)}
              placeholder="Alergias, indicaciones de montaje, tiempos…"
              rows={3}
              maxLength={1200}
              disabled={comandaBusy}
              autoFocus
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={thermalPreview !== null}
        onClose={() => { if (!comandaBusy) setThermalPreview(null) }}
        variant="compact"
        layer="derived"
        instance="encargo-comanda-thermal-preview"
        parentInstance="encargo-order-view"
        title="Previsualización del ticket"
        closeOnBackdrop={!comandaBusy}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              instance="encargo-comanda-preview-back"
              disabled={comandaBusy}
              onClick={() => {
                if (!thermalPreview) return
                setComandaLanguage(thermalPreview.language)
                setComandaObservations(thermalPreview.observations)
                setThermalPreview(null)
              }}
            >
              Volver
            </Button>
            <Button
              type="button"
              variant="primary"
              instance="encargo-comanda-preview-confirm"
              disabled={comandaBusy || !thermalPreview}
              loading={comandaBusy}
              loadingLabel="Enviando"
              onClick={() => void handleSendThermalComanda()}
            >
              Enviar a impresora
            </Button>
          </>
        }
      >
        <div className="flex min-h-0 flex-col gap-3 py-2">
          <Field
            instance="encargo-comanda-printer"
            label="Impresora de destino"
            htmlFor="encargo-comanda-printer-select"
          >
            <select
              id="encargo-comanda-printer-select"
              value={thermalPrinter}
              onChange={(event) => setThermalPrinter(event.target.value as KitchenPrinterId)}
              disabled={comandaBusy}
              className="min-h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-500 disabled:opacity-50"
            >
              {KITCHEN_PRINTERS.map((printer) => (
                <option key={printer.id} value={printer.id}>{printer.label}</option>
              ))}
            </select>
          </Field>
          <div className="min-h-0 max-h-[55dvh] overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-100 p-3">
            <div
              className="mx-auto w-[310px] max-w-full bg-white px-3 py-4 text-zinc-950 shadow-md"
              aria-label="Contenido del ticket térmico"
            >
              {thermalPreview?.layout.map((line, index) => (
                <div
                  key={index}
                  className={[
                    'font-mono text-[11px] leading-[14px]',
                    line.align === 'center' ? 'text-center' : 'text-left',
                    line.bold ? 'font-bold' : 'font-normal',
                    line.doubleHeight ? 'text-[20px] leading-[24px]' : '',
                    line.text === '' ? 'min-h-[14px]' : '',
                  ].join(' ')}
                >
                  {line.kind === 'item' ? (
                    <div className="flex items-start gap-1">
                      <span className="shrink-0 text-[19px] font-bold leading-5 tabular-nums">{line.quantity}</span>
                      <span className="min-w-0 break-words pt-0.5">{line.text}</span>
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap break-words">{line.text || ' '}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
          <p className="text-center text-[11px] text-zinc-500">
            Simulación de ticket de 80 mm. La tipografía puede variar según la impresora.
          </p>
        </div>
      </Modal>

      <Modal
        open={reopenConfirmOpen}
        onClose={() => { if (!isPending) setReopenConfirmOpen(false) }}
        variant="compact"
        layer="derived"
        instance="encargo-reopen-confirm"
        parentInstance="encargo-order-view"
        title="Reabrir pedido al cliente"
        closeOnBackdrop={!isPending}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              instance="encargo-order-reopen-cancelar"
              disabled={isPending}
              onClick={() => setReopenConfirmOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              instance="encargo-order-reopen-confirmar"
              disabled={isPending}
              loading={isPending}
              loadingLabel="Reabrir pedido"
              onClick={handleConfirmReopen}
            >
              Reabrir pedido
            </Button>
          </>
        }
      >
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
      </Modal>
    </>
  )
}