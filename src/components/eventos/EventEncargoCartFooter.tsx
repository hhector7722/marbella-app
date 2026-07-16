'use client'

import { useState } from 'react'
import { Minus, Plus, Loader2, ShoppingBag } from 'lucide-react'

import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'

export type EventEncargoCartLine = {
  key: string
  articuloId: number
  name: string
  quantity: number
  portion?: 'entero' | 'medio'
}

export function EventEncargoCartFooter({
  lines,
  totalLabel,
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
  totalLabel?: string
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
  const saveBlocked = saveDisabled || !hasLines || isPending

  const requestSave = () => {
    if (saveBlocked) return
    if (requireConfirm) {
      setCartOpen(false)
      setConfirmOpen(true)
      return
    }
    onSave()
  }

  return (
    <>
      <div className="shrink-0 border-t border-zinc-200 bg-white px-4 py-3 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] pb-safe md:px-5">
        {limitWarnings.length > 0 ? (
          <ul className="mb-2 space-y-1">
            {limitWarnings.map((w) => (
              <li key={w} className="text-xs font-bold leading-snug text-red-600">
                {w}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!hasLines}
            onClick={() => setCartOpen(true)}
            className={cn(
              'relative flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold transition-colors',
              hasLines
                ? 'border-zinc-200 bg-white text-zinc-900 active:bg-zinc-50'
                : 'cursor-not-allowed border-zinc-100 bg-zinc-50 text-zinc-400'
            )}
          >
            <ShoppingBag className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
            Ver pedido
            {hasLines && totalLabel ? (
              <span className="rounded-md bg-[#36606F]/10 px-1.5 py-0.5 text-[11px] font-black tabular-nums text-[#36606F]">
                {totalLabel}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            className={cn(
              'flex min-h-12 flex-1 items-center justify-center rounded-xl px-3 text-sm font-bold text-white shadow-md transition-all',
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
        </div>
      </div>

      <Modal
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        title="Tu pedido"
        usageId="event-encargo-cart"
        usageLabel="Ver pedido encargo"
        className="max-w-sm"
      >
        {lines.length === 0 ? (
          <p className="py-6 text-center text-sm font-semibold text-zinc-500">Aún no hay productos.</p>
        ) : (
          <div className="flex max-h-[min(50vh,22rem)] flex-col gap-1 overflow-y-auto overscroll-contain">
            {lines.map((line) => (
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
            ))}
          </div>
        )}

        {totalLabel ? (
          <p className="mt-3 text-right text-sm font-black text-[#36606F]">{totalLabel}</p>
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
      </Modal>

      <Modal
        open={confirmOpen}
        onClose={() => !isPending && setConfirmOpen(false)}
        title={confirmTitle}
        usageId="event-encargo-send-confirm"
        usageLabel="Confirmar envío pedido"
        className="max-w-sm"
      >
        <p className="text-sm font-semibold leading-relaxed text-zinc-700">{confirmBody}</p>
        <div className="mt-5 flex flex-col gap-2">
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
          <button
            type="button"
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-zinc-100 text-sm font-bold text-zinc-800 active:bg-zinc-200"
            disabled={isPending}
            onClick={() => setConfirmOpen(false)}
          >
            Cancelar
          </button>
        </div>
      </Modal>
    </>
  )
}
