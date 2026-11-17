'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { QuantityStepper } from '@/components/ui/QuantityStepper'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { Field } from '@/components/ui/Field'
import { formatCartaPrice } from '@/lib/carta-price-display'
import { formatCartaOrderProductName } from '@/lib/carta-menu-i18n'
import { cn } from '@/lib/utils'
import type { PlatoMarbellaOrderEntry } from '@/lib/event-order-carta'

export type EventEncargoCartLine = {
  key: string
  articuloId: number
  name: string
  quantity: number
  /** Precio unitario (€) de la ración (entero o medio). */
  unitPrice: number
  /** Imagen pequeña del catálogo (igual encuadre contain que Ventas). */
  photoUrl?: string | null
  portion?: 'entero' | 'medio'
  notes?: string
  platoMarbellaItems?: PlatoMarbellaOrderEntry[]
}

/** Miniatura flotante: imagen completa y centrada, sin tarjeta ni fondo propio. */
function CartProductThumbnail({ src }: { src?: string | null }) {
  const [failed, setFailed] = useState(false)
  return (
    <span aria-hidden="true" className="flex h-[22px] w-[22px] shrink-0 items-center justify-center bg-transparent">
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto de catálogo en Storage
        <img
          src={src}
          alt=""
          width={16}
          height={16}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="block h-[16px] w-[16px] max-h-full max-w-full object-contain object-center"
        />
      ) : null}
    </span>
  )
}

/** Badge rojo estilo campana de notificaciones. */
function UnitsBadge({ count, compact = false }: { count: number; compact?: boolean }) {
  if (count < 1) return null
  const label = count > 99 ? '99+' : String(count)
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-[#FF3B30] text-white tabular-nums',
        'font-semibold leading-none',
        compact ? 'min-h-4 min-w-4 px-[3px] text-[10px]' : 'min-h-[18px] min-w-[18px] px-1 text-[11px]'
      )}
      aria-hidden
    >
      {label}
    </span>
  )
}

/** El mismo acceso compacto al carrito, tanto en la portada como en cada categoría. */
export function EventEncargoViewOrderButton({
  units,
  onClick,
  instance = 'event-encargo-ver-pedido',
}: {
  units: number
  onClick: () => void
  instance?: string
}) {
  return (
    <div className="relative inline-flex shrink-0">
      <Button
        type="button"
        variant="secondary"
        instance={instance}
        disabled={units <= 0}
        onClick={onClick}
        className="flex-none"
      >
        Ver pedido
      </Button>
      {units > 0 ? (
        <span className="pointer-events-none absolute -right-2 top-[1px] z-10">
          <UnitsBadge count={units} compact />
        </span>
      ) : null}
    </div>
  )
}

export function EventEncargoCartFooter({
  lines,
  totalUnits = 0,
  limitWarnings = [],
  onIncrement,
  onDecrement,
  onSave,
  saveDisabled = false,
  isPending = false,
  saveLabel = 'Guardar',
  requireConfirm = false,
  confirmTitle = 'Enviar pedido',
  confirmBody = '¿Seguro que quieres enviar el pedido? Después no podrás modificarlo desde este enlace.',
  confirmActionLabel = 'Sí, enviar',
  clientOrderMode = false,
  orderNotes = '',
  onOrderNotesChange,
  onLineNotesChange,
  onPlatoMarbellaAddRequest,
  onPlatoMarbellaRemove,
  cartOpen: controlledCartOpen,
  onCartOpenChange,
}: {
  lines: EventEncargoCartLine[]
  /** Unidades totales para el badge (estilo notificación). */
  totalUnits?: number
  limitWarnings?: string[]
  onIncrement: (articuloId: number, portion?: 'entero' | 'medio') => void
  onDecrement: (articuloId: number, portion?: 'entero' | 'medio') => void
  onSave: () => void
  saveDisabled?: boolean
  isPending?: boolean
  saveLabel?: string
  /** Si true, pide confirmación antes de llamar a onSave. */
  requireConfirm?: boolean
  confirmTitle?: string
  confirmBody?: string
  confirmActionLabel?: string
  clientOrderMode?: boolean
  orderNotes?: string
  onOrderNotesChange?: (notes: string) => void
  onLineNotesChange?: (key: string, notes: string) => void
  onPlatoMarbellaAddRequest?: () => void
  onPlatoMarbellaRemove?: (key: string) => void
  /** Controlado solo en /pedido para abrir exactamente este carrito desde las categorías. */
  cartOpen?: boolean
  onCartOpenChange?: (open: boolean) => void
}) {
  const [internalCartOpen, setInternalCartOpen] = useState(false)
  const cartOpen = controlledCartOpen ?? internalCartOpen
  const setCartOpen = onCartOpenChange ?? setInternalCartOpen
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [plateDetailsOpen, setPlateDetailsOpen] = useState(false)
  const [removalKey, setRemovalKey] = useState<string | null>(null)
  const [noteEditor, setNoteEditor] = useState<{ kind: 'line' | 'order'; key?: string } | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const hasLines = lines.length > 0
  const units = totalUnits > 0 ? totalUnits : lines.reduce((s, l) => s + l.quantity, 0)
  const totalPrice = lines.reduce((s, l) => s + Math.max(0, l.unitPrice) * Math.max(0, l.quantity), 0)
  const saveBlocked = saveDisabled || !hasLines || isPending
  const removalLine = lines.find((line) => line.key === removalKey)
  const plateDetails = lines.flatMap((line) => line.platoMarbellaItems ?? [])
  const requestAnotherPlate = () => {
    setPlateDetailsOpen(false)
    setCartOpen(false)
    onPlatoMarbellaAddRequest?.()
  }

  const openNoteEditor = (kind: 'line' | 'order', key?: string) => {
    setNoteDraft(
      kind === 'order'
        ? orderNotes
        : (lines.find((line) => line.key === key)?.notes ??
          plateDetails.find((plate) => plate.key === key)?.note ??
          '')
    )
    setNoteEditor({ kind, key })
  }

  const saveNote = () => {
    if (!noteEditor) return
    const note = noteDraft.trim()
    if (noteEditor.kind === 'order') onOrderNotesChange?.(note)
    else if (noteEditor.key) onLineNotesChange?.(noteEditor.key, note)
    setNoteEditor(null)
  }

  const requestSave = () => {
    if (saveBlocked) return
    if (requireConfirm) {
      setConfirmOpen(true)
      return
    }
    onSave()
  }

  return (
    <>
      <div
        className={cn(
          'shrink-0 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]',
          clientOrderMode
            ? 'bg-transparent px-0 border-0 shadow-none'
            : 'border-t border-zinc-200 bg-white px-3 shadow-[0_-8px_16px_rgba(0,0,0,0.04)] md:px-4'
        )}
      >
        {limitWarnings.length > 0 ? (
          <ul className="mb-1.5 space-y-0.5">
            {limitWarnings.map((w) => (
              <li key={w} className="text-xs font-bold leading-snug text-red-600">
                {w}
              </li>
            ))}
          </ul>
        ) : null}

        <div className={clientOrderMode ? 'flex w-full items-center justify-center' : 'flex items-center gap-2'}>
          {clientOrderMode ? (
            <EventEncargoViewOrderButton
              units={hasLines ? units : 0}
              onClick={() => setCartOpen(true)}
            />
          ) : (
            <Button
              type="button"
              variant="secondary"
              instance="event-encargo-ver-pedido"
              disabled={!hasLines}
              onClick={() => setCartOpen(true)}
              className="relative flex-1"
            >
              Ver pedido
              {hasLines && units > 0 ? <UnitsBadge count={units} /> : null}
            </Button>
          )}

          {!clientOrderMode ? (
            <Button
              type="button"
              variant="primary"
              instance="event-encargo-send"
              className="flex-1"
              disabled={saveBlocked}
              loading={isPending}
              onClick={requestSave}
            >
              {saveLabel}
            </Button>
          ) : null}
        </div>
      </div>

      <Modal
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        title="Tu pedido"
        instance="event-encargo-cart"
        usageId="event-encargo-cart"
        usageLabel="Ver pedido encargo"
        variant={clientOrderMode ? 'standard' : 'compact'}
        footer={
          clientOrderMode ? (
            <div data-client-order-footer className="grid w-full min-w-0 grid-cols-2 gap-x-2 gap-y-1">
              <div data-client-order-total className="col-span-2 min-w-0 border-b border-zinc-100 pb-1">
                <div className="flex min-w-0 items-center justify-between gap-1.5">
                  <Button
                    type="button"
                    variant="tertiary"
                    instance="event-encargo-cart-add-order-notes"
                    onClick={() => openNoteEditor('order')}
                  >
                    {orderNotes.trim() ? 'Editar indicaciones' : 'Añadir indicaciones'}
                  </Button>
                  <div className="flex shrink-0 items-baseline gap-2 whitespace-nowrap tabular-nums">
                    <span className="text-[10px] font-semibold text-zinc-500">{units} uds.</span>
                    <span className="text-[15px] font-extrabold text-[#1b4a82]">
                      Total {formatCartaPrice(totalPrice)}
                    </span>
                  </div>
                </div>
                {orderNotes.trim() ? (
                  <p title={orderNotes} className="mt-0.5 truncate text-[10px] leading-tight text-zinc-500">
                    Indicaciones: {orderNotes}
                  </p>
                ) : null}
              </div>
              <div className="min-w-0">
                <Button
                  type="button"
                  variant="secondary"
                  layout="fill"
                  instance="event-encargo-cart-continue"
                  onClick={() => setCartOpen(false)}
                >
                  Seguir eligiendo
                </Button>
              </div>
              <div className="min-w-0">
                <Button
                  type="button"
                  variant="primary"
                  layout="fill"
                  instance="event-encargo-cart-send"
                  disabled={saveBlocked}
                  loading={isPending}
                  onClick={requestSave}
                >
                  {saveLabel}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex w-full items-center justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                instance="event-encargo-cart-continue"
                onClick={() => setCartOpen(false)}
              >
                Seguir eligiendo
              </Button>
              <Button
                type="button"
                variant="primary"
                instance="event-encargo-cart-send"
                disabled={saveBlocked}
                loading={isPending}
                onClick={requestSave}
              >
                {saveLabel}
              </Button>
            </div>
          )
        }
      >
        <div
          data-client-order-list={clientOrderMode ? 'true' : undefined}
          className={clientOrderMode ? 'min-w-0 px-1' : 'space-y-3'}
        >
          {lines.length === 0 ? (
            <EmptyState instance="event-encargo-cart-none" variant="none" title="Aún no hay productos." />
          ) : (
            <div
              className={clientOrderMode
                ? 'min-w-0 divide-y divide-zinc-100'
                : 'flex max-h-[min(50vh,22rem)] flex-col gap-1 overflow-y-auto overscroll-contain rounded-xl border border-zinc-100 bg-zinc-50/60 px-1'}
            >
              {lines.map((line) => {
                const lineTotal = Math.max(0, line.unitPrice) * Math.max(0, line.quantity)
                const quantitySelector = (
                  <QuantityStepper
                    value={line.quantity}
                    max={999}
                    onDecrement={clientOrderMode && line.quantity === 1 ? () => setRemovalKey(line.key) : undefined}
                    onChange={(n) => {
                      const next = Math.max(0, Math.floor(n))
                      const delta = next - line.quantity
                      const portion = line.portion ?? 'entero'
                      if (delta > 0) {
                        for (let i = 0; i < delta; i++) onIncrement(line.articuloId, portion)
                      } else if (delta < 0) {
                        for (let i = 0; i < -delta; i++) onDecrement(line.articuloId, portion)
                      }
                    }}
                    min={0}
                    ariaLabel={`Cantidad de ${line.name}`}
                  />
                )

                if (clientOrderMode) {
                  const plates = line.platoMarbellaItems
                  const isPlate = Boolean(plates?.length)
                  const lineNote = line.notes?.trim() ?? ''
                  return (
                    <div key={line.key} className="flex h-[34px] min-w-0 items-center gap-1.5 px-1" role="listitem">
                      <CartProductThumbnail key={line.photoUrl || line.key} src={line.photoUrl} />
                      {isPlate ? (
                        <button
                          type="button"
                          title="Ver las elecciones de cada Plato Marbella"
                          aria-label={`Ver ingredientes de ${line.name}`}
                          onClick={() => setPlateDetailsOpen(true)}
                          className="min-w-0 flex-1 truncate text-left text-[12px] font-bold leading-none text-[#1b4a82] underline decoration-[#b3cbea] underline-offset-2"
                        >
                          {formatCartaOrderProductName(line.name)}
                        </button>
                      ) : (
                        <span
                          className="min-w-0 flex-1 truncate text-[12px] font-semibold leading-none text-zinc-900"
                          title={line.name}
                        >
                          {formatCartaOrderProductName(line.name)}
                        </span>
                      )}
                      {isPlate ? (
                        <button
                          type="button"
                          aria-label={plates?.length === 1
                            ? `Añadir o editar nota de ${line.name}`
                            : `Elegir Plato Marbella para añadir una nota`}
                          title={plates?.length === 1 ? (plates[0]?.note || 'Añadir nota') : 'Añadir nota a un plato'}
                          onClick={() => {
                            if (plates?.length === 1 && plates[0]) openNoteEditor('line', plates[0].key)
                            else setPlateDetailsOpen(true)
                          }}
                          className="min-w-0 max-w-[32%] flex-[0_1_auto] overflow-hidden border-0 bg-transparent p-0 text-left text-[9px] italic font-normal leading-none text-zinc-400 hover:text-zinc-600"
                        >
                          <span className="block w-full truncate whitespace-nowrap">
                            {plates?.length === 1 && plates[0]?.note?.trim() ? plates[0].note.trim() : 'Añadir nota'}
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          aria-label={lineNote ? `Editar nota de ${line.name}` : `Añadir nota a ${line.name}`}
                          title={lineNote || 'Añadir nota'}
                          onClick={() => openNoteEditor('line', line.key)}
                          className="min-w-0 max-w-[32%] flex-[0_1_auto] overflow-hidden border-0 bg-transparent p-0 text-left text-[9px] italic font-normal leading-none text-zinc-400 hover:text-zinc-600"
                        >
                          <span className="block w-full truncate whitespace-nowrap">
                            {lineNote || 'Añadir nota'}
                          </span>
                        </button>
                      )}
                      <div data-pedido-quantity-pill className="h-[26px] w-[76px] shrink-0 overflow-hidden rounded-full border border-[rgb(55_119_192_/_0.38)] bg-transparent text-[#1b4a82]">
                        <QuantityStepper
                          variant="bar"
                          value={line.quantity}
                          min={0}
                          max={isPlate ? 99 : 999}
                          ariaLabel={`Cantidad de ${line.name}`}
                          className="h-full w-full"
                          onDecrement={
                            isPlate
                              ? () => {
                                  const last = plates?.[plates.length - 1]
                                  if (last) onPlatoMarbellaRemove?.(last.key)
                                }
                              : line.quantity === 1 ? () => setRemovalKey(line.key) : undefined
                          }
                          onChange={(nextValue) => {
                            const next = Math.max(0, Math.floor(nextValue))
                            if (isPlate) {
                              if (next > line.quantity) requestAnotherPlate()
                              else if (next < line.quantity) {
                                const last = plates?.[plates.length - 1]
                                if (last) onPlatoMarbellaRemove?.(last.key)
                              }
                              return
                            }
                            const delta = next - line.quantity
                            const portion = line.portion ?? 'entero'
                            if (delta > 0) {
                              for (let i = 0; i < delta; i++) onIncrement(line.articuloId, portion)
                            } else if (delta < 0) {
                              for (let i = 0; i < -delta; i++) {
                                if (line.quantity - i === 1) setRemovalKey(line.key)
                                else onDecrement(line.articuloId, portion)
                              }
                            }
                          }}
                        />
                      </div>
                      <span
                        className="w-[52px] shrink-0 whitespace-nowrap text-right text-[11px] font-bold tabular-nums text-zinc-900"
                        title={formatCartaPrice(lineTotal).trim()}
                      >
                        {formatCartaPrice(lineTotal)}
                      </span>
                    </div>
                  )
                }

                return (
                  <div key={line.key} className="flex min-h-12 items-center gap-1 border-b border-zinc-100 py-1 last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 break-words text-xs font-semibold text-zinc-900" title={line.name}>
                        {line.name}
                      </p>
                    </div>
                    <div className="w-[calc(var(--tactil-minimo)*2+var(--espacio-8))] shrink-0">
                      {quantitySelector}
                    </div>
                    <p
                      className="shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums text-zinc-900"
                      title={formatCartaPrice(lineTotal).trim() || undefined}
                    >
                      {formatCartaPrice(lineTotal)}
                    </p>
                  </div>
                )
              })}
            </div>
          )}

          {hasLines && !clientOrderMode ? (
            <div className={cn(
              'flex items-baseline justify-between gap-3',
              clientOrderMode ? 'rounded-xl border border-[#d3e1f2] bg-[#eef4fc] px-3 py-3' : 'mt-3'
            )}>
              <p className="text-sm font-bold text-zinc-500">{units > 0 ? `${units} uds.` : ' '}</p>
              <p className={cn('text-base font-black tabular-nums', clientOrderMode ? 'text-[#1b4a82]' : 'text-[#36606F]')}>
                Total {formatCartaPrice(totalPrice)}
              </p>
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={plateDetailsOpen && plateDetails.length > 0}
        onClose={() => setPlateDetailsOpen(false)}
        title="Platos Marbella"
        instance="event-encargo-cart-plate-details"
        parentInstance="event-encargo-cart"
        layer="derived"
        dismissScope="self"
        variant="standard"
      >
        <div className="space-y-2 pb-2">
          <p className="text-xs text-zinc-500">
            Cada plato tiene sus propias elecciones. Pulsa uno para verlas.
          </p>
          {plateDetails.map((plate, index) => (
            <details key={plate.key} className="group overflow-hidden rounded-xl border border-zinc-200 bg-white">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-3 text-sm font-bold text-zinc-900 marker:hidden">
                <span>Plato Marbella {index + 1}</span>
                <span className="text-xs text-[#1b4a82] group-open:hidden">Ver ingredientes</span>
                <span className="hidden text-xs text-[#1b4a82] group-open:inline">Ocultar</span>
              </summary>
              <div className="space-y-2 border-t border-zinc-100 bg-zinc-50/60 px-3 py-3">
                <p className="text-xs text-zinc-800"><strong>Entrante:</strong> {plate.choices.entrante}</p>
                <p className="text-xs text-zinc-800"><strong>Principal:</strong> {plate.choices.principal}</p>
                <p className="text-xs text-zinc-800"><strong>Guarnición:</strong> {plate.choices.guarnicion}</p>
                <button
                  type="button"
                  aria-label={plate.note ? `Editar nota del Plato Marbella ${index + 1}` : `Añadir nota al Plato Marbella ${index + 1}`}
                  title={plate.note || 'Añadir nota'}
                  onClick={() => openNoteEditor('line', plate.key)}
                  className="block max-w-full truncate border-0 bg-transparent p-0 text-left text-[11px] italic font-normal text-zinc-500 hover:text-zinc-700"
                >
                  {plate.note || 'Añadir nota'}
                </button>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="destructive"
                    instance={`event-encargo-cart-remove-plate-${plate.key}`}
                    onClick={() => {
                      onPlatoMarbellaRemove?.(plate.key)
                      if (plateDetails.length <= 1) setPlateDetailsOpen(false)
                    }}
                  >
                    Quitar este plato
                  </Button>
                </div>
              </div>
            </details>
          ))}
          <div className="flex justify-end pt-1">
            <Button
              type="button"
              variant="primary"
              instance="event-encargo-cart-plate-add-another"
              onClick={requestAnotherPlate}
            >
              + Añadir otro plato
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={noteEditor !== null}
        onClose={() => setNoteEditor(null)}
        title={noteEditor?.kind === 'order' ? 'Indicaciones del pedido' : 'Nota del producto'}
        instance="event-encargo-cart-note"
        parentInstance={plateDetailsOpen &&
          noteEditor?.kind === 'line' && noteEditor.key?.startsWith('pm-')
          ? 'event-encargo-cart-plate-details'
          : 'event-encargo-cart'}
        layer="derived"
        dismissScope="self"
        variant="compact"
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button type="button" variant="secondary" instance="event-encargo-cart-note-cancel" onClick={() => setNoteEditor(null)}>
              Cancelar
            </Button>
            <Button type="button" variant="primary" instance="event-encargo-cart-note-save" onClick={saveNote}>
              Guardar
            </Button>
          </div>
        }
      >
        <Field
          instance="event-encargo-cart-note-field"
          label={noteEditor?.kind === 'order' ? 'Indicaciones para todo el pedido' : 'Nota para este producto'}
          htmlFor="event-encargo-cart-note-input"
        >
          <textarea
            id="event-encargo-cart-note-input"
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            maxLength={400}
            rows={4}
          />
        </Field>
      </Modal>

      <ConfirmModal
        open={Boolean(removalLine)}
        onClose={() => setRemovalKey(null)}
        title="Eliminar producto"
        confirmLabel="Sí, eliminar"
        confirmVariant="destructive"
        instance="event-encargo-cart-remove-confirm"
        parentInstance="event-encargo-cart"
        onConfirm={() => {
          if (removalLine) onDecrement(removalLine.articuloId, removalLine.portion ?? 'entero')
          setRemovalKey(null)
        }}
      >
        {removalLine ? `Se eliminará ${formatCartaOrderProductName(removalLine.name)} del pedido. ¿Quieres continuar?` : ''}
      </ConfirmModal>

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={confirmTitle}
        confirmLabel={confirmActionLabel}
        confirmVariant="primary"
        instance="event-encargo-send-confirm"
        usageLabel="Confirmar envío pedido"
        parentInstance={cartOpen ? 'event-encargo-cart' : undefined}
        confirming={isPending}
        onConfirm={() => {
          setConfirmOpen(false)
          onSave()
        }}
      >
        {confirmBody}
      </ConfirmModal>
    </>
  )
}
