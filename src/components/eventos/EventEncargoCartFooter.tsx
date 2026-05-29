'use client'

import { Minus, Plus, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type EventEncargoCartLine = {
  key: string
  articuloId: number
  name: string
  quantity: number
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
}: {
  lines: EventEncargoCartLine[]
  totalLabel?: string
  limitWarnings?: string[]
  onIncrement: (articuloId: number) => void
  onDecrement: (articuloId: number) => void
  onSave: () => void
  saveDisabled?: boolean
  isPending?: boolean
}) {
  return (
    <div className="shrink-0 border-t border-zinc-200 bg-white px-4 py-4 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] pb-safe md:px-5">
      {lines.length > 0 ? (
        <>
          <h3 className="mb-2 font-bold text-zinc-900">Tu pedido:</h3>
          <div className="mb-3 max-h-[28vh] overflow-y-auto overscroll-contain pr-0.5">
            <div className="flex flex-col gap-2">
              {lines.map((line) => (
                <div key={line.key} className="flex min-h-12 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onDecrement(line.articuloId)}
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
                  <div className="shrink-0 tabular-nums text-sm font-black text-zinc-700">×{line.quantity}</div>
                  <button
                    type="button"
                    onClick={() => onIncrement(line.articuloId)}
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
          </div>
        </>
      ) : null}

      {totalLabel ? (
        <p className="mb-2 text-right text-sm font-black text-[#36606F]">{totalLabel}</p>
      ) : null}

      {limitWarnings.length > 0 ? (
        <ul className="mb-2 space-y-1">
          {limitWarnings.map((w) => (
            <li key={w} className="text-xs font-bold leading-snug text-red-600">
              {w}
            </li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        className={cn(
          'flex min-h-12 w-full items-center justify-center rounded-xl py-2.5 text-sm font-bold text-white shadow-md transition-all',
          lines.length > 0
            ? 'bg-[#36606F] hover:bg-[#2a4a56] active:scale-[0.99]'
            : 'bg-zinc-200 text-zinc-600 shadow-none',
          'disabled:cursor-not-allowed disabled:opacity-70'
        )}
        disabled={saveDisabled || lines.length <= 0 || isPending}
        onClick={onSave}
      >
        {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Guardar'}
      </button>
    </div>
  )
}
