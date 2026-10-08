'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { QuantityStepper } from '@/components/ui/QuantityStepper'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { Field } from '@/components/ui/Field'
import { formatCartaPrice } from '@/lib/carta-price-display'
import { cn } from '@/lib/utils'

export type EventEncargoCartLine = {
  key: string
  articuloId: number
  name: string
  quantity: number
  /** Precio unitario (€) de la ración (entero o medio). */
  unitPrice: number
  portion?: 'entero' | 'medio'
  notes?: string
}

function cartDisplayName(name: string): string {
  const letters = name.match(/\p{L}/gu)
  if (!letters?.length || letters.some((letter) => letter !== letter.toLocaleUpperCase('es'))) return name
  const lower = name.toLocaleLowerCase('es')
  return lower.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase('es'))
}

/** Badge rojo estilo campana de notificaciones. */
function UnitsBadge({ count }: { count: number }) {
  if (count < 1) return null
  const label = count > 99 ? '99+' : String(count)
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-[#FF3B30] text-white tabular-nums',
        'font-semibold leading-none',
        'min-h-[18px] min-w-[18px] px-1 text-[11px]'
      )}
      aria-hidden
    >
      {label}
    </span>
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
}) {
  const [cartOpen, setCartOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [removalKey, setRemovalKey] = useState<string | null>(null)
  const [noteEditor, setNoteEditor] = useState<{ kind: 'line' | 'order'; key?: string } | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const hasLines = lines.length > 0
  const units = totalUnits > 0 ? totalUnits : lines.reduce((s, l) => s + l.quantity, 0)
  const totalPrice = lines.reduce((s, l) => s + Math.max(0, l.unitPrice) * Math.max(0, l.quantity), 0)
  const saveBlocked = saveDisabled || !hasLines || isPending
  const removalLine = lines.find((line) => line.key === removalKey)

  const openNoteEditor = (kind: 'line' | 'order', key?: string) => {
    setNoteDraft(kind === 'order' ? orderNotes : lines.find((line) => line.key === key)?.notes ?? '')
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
      <div className="shrink-0 border-t border-zinc-200 bg-white px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-8px_16px_rgba(0,0,0,0.04)] md:px-4">
        {limitWarnings.length > 0 ? (
          <ul className="mb-1.5 space-y-0.5">
            {limitWarnings.map((w) => (
              <li key={w} className="text-xs font-bold leading-snug text-red-600">
                {w}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex items-center gap-2">
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
          <div className="grid w-full grid-cols-2 items-center gap-2 sm:flex sm:justify-end">
            {clientOrderMode ? (
              <Button
                type="button"
                variant="tertiary"
                instance="event-encargo-cart-add-order-notes"
                onClick={() => openNoteEditor('order')}
              >
                Añadir indicaciones
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              instance="event-encargo-cart-continue"
              onClick={() => setCartOpen(false)}
              className={clientOrderMode ? 'justify-self-end' : undefined}
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
              className={clientOrderMode ? 'col-span-2 justify-self-end sm:col-span-1' : undefined}
            >
              {saveLabel}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {lines.length === 0 ? (
            <EmptyState instance="event-encargo-cart-none" variant="none" title="Aún no hay productos." />
          ) : (
            <div className="flex max-h-[min(50vh,22rem)] flex-col gap-1 overflow-y-auto overscroll-contain rounded-xl border border-zinc-100 bg-zinc-50/60 px-1">
              {lines.map((line) => {
                const lineTotal = Math.max(0, line.unitPrice) * Math.max(0, line.quantity)
                return (
                  <div
                    key={line.key}
                    className="flex min-h-12 items-center gap-1 border-b border-zinc-100 py-1 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 break-words text-xs font-semibold text-zinc-900" title={line.name}>
                        {clientOrderMode ? cartDisplayName(line.name) : line.name}
                      </p>
                    </div>
                    {clientOrderMode ? (
                      <div className="w-12 shrink-0 sm:w-auto">
                        <Button
                          type="button"
                          variant="tertiary"
                          layout="fill"
                          instance="event-encargo-cart-add-line-note"
                          onClick={() => openNoteEditor('line', line.key)}
                          aria-label={`Añadir nota a ${line.name}${line.notes ? '. Nota actual: ' + line.notes : ''}`}
                        >
                          <span className="sm:hidden">+ Nota</span>
                          <span className="hidden sm:inline">Añadir nota</span>
                        </Button>
                      </div>
                    ) : null}
                    <div className="w-[calc(var(--tactil-minimo)*2+var(--espacio-8))] shrink-0">
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

          {hasLines ? (
            <div className="mt-3 flex items-baseline justify-between gap-3">
              <p className="text-sm font-bold text-zinc-500">{units > 0 ? `${units} uds.` : ' '}</p>
              <p className="text-base font-black tabular-nums text-[#36606F]">
                Total {formatCartaPrice(totalPrice)}
              </p>
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={noteEditor !== null}
        onClose={() => setNoteEditor(null)}
        title={noteEditor?.kind === 'order' ? 'Indicaciones del pedido' : 'Nota del producto'}
        instance="event-encargo-cart-note"
        parentInstance="event-encargo-cart"
        layer="derived"
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
        {removalLine ? `Se eliminará ${cartDisplayName(removalLine.name)} del pedido. ¿Quieres continuar?` : ''}
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
