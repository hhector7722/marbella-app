'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import { ChefHat, Loader2, Pencil, Printer, Receipt } from 'lucide-react'
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
  formatEncargoProductLabel,
  formatEncargoProductNote,
} from '@/lib/encargo-staff-helpers'
import { isDrinkConsumptionRecipe } from '@/lib/staff-consumption-display'
import { createClient } from '@/utils/supabase/client'
import {
  createEncargoPdfPreviewWindow,
  generateEncargoPdf,
  openEncargoPdf,
  type EncargoDocumentLanguage,
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

/**
 * La comanda de cocina solo lleva comida: descarta los productos de bebidas
 * (categorías «Bebidas», «Cafetería»…) según el catálogo de productos de evento.
 * Si no se puede resolver la categoría, se mantiene la línea.
 */
async function filterKitchenItems(items: EventOrderItem[]): Promise<EventOrderItem[]> {
  if (items.length === 0) return items
  const productIds = Array.from(new Set(items.map((it) => it.product_id)))
  try {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('event_products')
      .select('product_id, name, category')
      .in('product_id', productIds)
    if (error || !data) return items
    const drinkIds = new Set(
      data
        .filter((row) => isDrinkConsumptionRecipe({ name: row.name, category: row.category }))
        .map((row) => row.product_id),
    )
    if (drinkIds.size === 0) return items
    return items.filter((it) => !drinkIds.has(it.product_id))
  } catch {
    return items
  }
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
  const [comandaLanguage, setComandaLanguage] = useState<EncargoDocumentLanguage | null>(null)
  const [comandaObservations, setComandaObservations] = useState('')

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
      const kitchenItems = await filterKitchenItems(items)
      if (kitchenItems.length === 0) {
        try {
          previewWindow?.close()
        } catch {
          // La pestaña puede haber sido cerrada por el usuario.
        }
        toast.error('No hay comida en este pedido: la comanda quedaría vacía.')
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
        kitchenItems
      )
      openEncargoPdf(pdf, previewWindow)
    } catch (error) {
      try {
        previewWindow?.close()
      } catch {
        // La pestaña puede haber sido cerrada por el usuario.
      }
      console.error('encargo comanda pdf failed', error)
      toast.error('No se pudo generar la comanda PDF.')
    } finally {
      setComandaBusy(false)
    }
  }, [comandaBusy, encargoName, encargoDate, encargoTime, contactPhone, guestCount, items])

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
      }
    },
    [printLanguageFor, handlePrint]
  )

  const handleGenerateInvoice = useCallback(() => {
    if (!invoiceLanguage || invoiceBusy) return
    // Abrir la pestaña dentro del gesto del usuario evita el bloqueo de popups en Safari iOS.
    const previewWindow = createEncargoPdfPreviewWindow()
    const language = invoiceLanguage
    const number = invoiceNumber
    setInvoiceLanguage(null)
    setInvoiceNumber('')
    void handlePrintInvoice(language, number, previewWindow)
  }, [invoiceLanguage, invoiceNumber, invoiceBusy, handlePrintInvoice])

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
              onClick={() => setPrintLanguageFor('quote')}
              disabled={items.length === 0 || printBusy}
              className="relative flex h-full max-h-full min-h-0 w-[var(--modal-header-height)] shrink-0 items-center justify-center border-0 bg-transparent text-zinc-700 shadow-none outline-none hover:bg-zinc-100 disabled:opacity-40 active:opacity-70 before:absolute before:inset-0 before:-m-[6px] before:min-h-12 before:min-w-12 before:content-['']"
              aria-label="Generar presupuesto PDF"
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
              className="relative flex h-full max-h-full min-h-0 w-[var(--modal-header-height)] shrink-0 items-center justify-center border-0 bg-transparent text-zinc-700 shadow-none outline-none hover:bg-zinc-100 active:opacity-70 before:absolute before:inset-0 before:-m-[6px] before:min-h-12 before:min-w-12 before:content-['']"
              aria-label="Editar encargo"
            >
              <Pencil size={18} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={() => setPrintLanguageFor('invoice')}
              disabled={items.length === 0 || invoiceBusy}
              className="relative flex h-full max-h-full min-h-0 w-[var(--modal-header-height)] shrink-0 items-center justify-center border-0 bg-transparent text-zinc-700 shadow-none outline-none hover:bg-zinc-100 disabled:opacity-40 active:opacity-70 before:absolute before:inset-0 before:-m-[6px] before:min-h-12 before:min-w-12 before:content-['']"
              aria-label="Generar factura PDF"
            >
              {invoiceBusy ? (
                <Loader2 size={18} strokeWidth={2.5} className="animate-spin" />
              ) : (
                <Receipt size={18} strokeWidth={2.5} />
              )}
            </button>
            <button
              type="button"
              onClick={() => setPrintLanguageFor('comanda')}
              disabled={items.length === 0 || comandaBusy}
              className="relative flex h-full max-h-full min-h-0 w-[var(--modal-header-height)] shrink-0 items-center justify-center border-0 bg-transparent text-zinc-700 shadow-none outline-none hover:bg-zinc-100 disabled:opacity-40 active:opacity-70 before:absolute before:inset-0 before:-m-[6px] before:min-h-12 before:min-w-12 before:content-['']"
              aria-label="Generar comanda de cocina PDF"
            >
              {comandaBusy ? (
                <Loader2 size={18} strokeWidth={2.5} className="animate-spin" />
              ) : (
                <ChefHat size={18} strokeWidth={2.5} />
              )}
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
                        <td className="px-3 py-2.5 font-bold text-zinc-800 align-middle whitespace-nowrap">
                          {productLabel}
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
        open={invoiceLanguage !== null}
        onClose={() => {
          if (!invoiceBusy) {
            setInvoiceLanguage(null)
            setInvoiceNumber('')
          }
        }}
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
              onClick={() => {
                setInvoiceLanguage(null)
                setInvoiceNumber('')
              }}
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
        title="Comanda de cocina"
        closeOnBackdrop={!comandaBusy}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              instance="encargo-comanda-observations-cancel"
              disabled={comandaBusy}
              onClick={() => {
                setComandaLanguage(null)
                setComandaObservations('')
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              instance="encargo-comanda-observations-generate"
              disabled={comandaBusy}
              loading={comandaBusy}
              loadingLabel="Generando comanda"
              onClick={handleGenerateComanda}
            >
              Generar comanda
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
              disabled={comandaBusy}
              autoFocus
            />
          </Field>
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
