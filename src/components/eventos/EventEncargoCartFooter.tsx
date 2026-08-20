'use client'

import { useState } from 'react'
import { Minus, Plus, Loader2 } from 'lucide-react'

import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
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
  confirmTitle = '¿Enviar pedido?',
  confirmBody = '¿Seguro que quieres enviar el pedido? Después no podrás modificarlo desde este enlace.',
  confirmActionLabel = 'Sí, enviar',
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
}) {
  const [cartOpen, setCartOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const hasLines = lines.length > 0
  const units = totalUnits > 0 ? totalUnits : lines.reduce((s, l) => s + l.quantity, 0)
  const totalPrice = lines.reduce((s, l) => s + Math.max(0, l.unitPrice) * Math.max(0, l.quantity), 0)
  const saveBlocked = saveDisabled || !hasLines || isPending

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

          <button
            type="button"
            className={cn(
              'flex h-10 min-h-10 flex-1 items-center justify-center rounded-xl px-3',
              'text-sm font-bold whitespace-nowrap text-white shadow-md transition-all',
              hasLines
                ? 'bg-[#36606F] hover:bg-[#2a4a56] active:scale-[0.99]'
                : 'bg-zinc-200 text-zinc-600 shadow-none',
              'disabled:cursor-not-allowed disabled:opacity-70'
            )}
            disabled={saveBlocked}
            onClick={requestSave}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : saveLabel}
          </button>
        </div>
      </div>

      <Modal
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        title="Tu pedido"
        instance="event-encargo-cart"
        usageId="event-encargo-cart"
        usageLabel="Ver pedido encargo"
        variant="compact"
      >
        <div className="space-y-3">
          {lines.length === 0 ? (
            <p className="py-6 text-center text-sm font-semibold text-zinc-500">
              Aún no hay productos.
            </p>
          ) : (
            <div className="flex max-h-[min(50vh,22rem)] flex-col gap-1 overflow-y-auto overscroll-contain rounded-xl border border-zinc-100 bg-zinc-50/60 px-1">
              {lines.map((line) => {
                const lineTotal = Math.max(0, line.unitPrice) * Math.max(0, line.quantity)
                return (
                  <div
                    key={line.key}
                    className="flex min-h-12 items-center gap-1 border-b border-zinc-100 py-1 last:border-b-0"
                  >
                    <button
                      type="button"
                      onClick={() => onDecrement(line.articuloId, line.portion ?? 'entero')}
                      className={cn(
                        'inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-xl text-zinc-400',
                        'transition-colors hover:text-zinc-600 active:scale-[0.98]'
                      )}
                      aria-label={`Quitar una unidad de ${line.name}`}
                    >
                      <Minus className="h-5 w-5" strokeWidth={2.5} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-zinc-900" title={line.name}>
                        {line.name}
                      </p>
                    </div>
                    <div className="shrink-0 tabular-nums text-sm font-black text-zinc-700">
                      ×{line.quantity}
                    </div>
                    <div
                      className="w-[4.25rem] shrink-0 text-right tabular-nums text-sm font-bold text-zinc-900"
                      title={formatCartaPrice(lineTotal).trim() || undefined}
                    >
                      {formatCartaPrice(lineTotal)}
                    </div>
                    <button
                      type="button"
                      onClick={() => onIncrement(line.articuloId, line.portion ?? 'entero')}
                      className={cn(
                        'inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-xl text-zinc-400',
                        'transition-colors hover:text-zinc-600 active:scale-[0.98]'
                      )}
                      aria-label={`Añadir una unidad de ${line.name}`}
                    >
                      <Plus className="h-5 w-5" strokeWidth={2.5} />
                    </button>
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

          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              className={cn(
                'flex min-h-12 w-full items-center justify-center rounded-xl py-2.5 text-sm font-bold text-white shadow-md transition-all',
                hasLines
                  ? 'bg-[#36606F] hover:bg-[#2a4a56] active:scale-[0.99]'
                  : 'bg-zinc-200 text-zinc-600 shadow-none',
                'disabled:cursor-not-allowed disabled:opacity-70'
              )}
              disabled={saveBlocked}
              onClick={requestSave}
            >
              {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : saveLabel}
            </button>
            <button
              type="button"
              className="flex min-h-12 w-full items-center justify-center rounded-xl bg-zinc-100 text-sm font-bold text-zinc-800 active:bg-zinc-200"
              onClick={() => setCartOpen(false)}
            >
              Seguir eligiendo
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={confirmOpen}
        onClose={() => !isPending && setConfirmOpen(false)}
        title={confirmTitle}
        usageId="event-encargo-send-confirm"
        usageLabel="Confirmar envío pedido"
        variant="compact"
      >
        <div className="space-y-5">
          <p className="text-sm font-semibold leading-relaxed text-zinc-700">{confirmBody}</p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className={cn(
                'flex min-h-12 w-full items-center justify-center rounded-xl py-2.5 text-sm font-bold text-white',
                'bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99]',
                'disabled:cursor-not-allowed disabled:opacity-70'
              )}
              disabled={isPending}
              onClick={() => {
                setConfirmOpen(false)
                onSave()
              }}
            >
              {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : confirmActionLabel}
            </button>
            <Button
              type="button"
              variant="secondary"
              instance="event-encargo-cart-cancel"
              className="w-full"
              disabled={isPending}
              onClick={() => setConfirmOpen(false)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
