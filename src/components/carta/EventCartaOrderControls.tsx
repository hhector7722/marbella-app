'use client'

import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

export function EventCartaOrderControls({
  quantity,
  onIncrement,
  onDecrement,
  className,
}: {
  quantity: number
  onIncrement: () => void
  onDecrement: () => void
  className?: string
}) {
  return (
    <div className={cn('flex w-full shrink-0 items-center justify-center gap-2', className)}>
      <button
        type="button"
        className="flex min-h-12 min-w-[48px] shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-800 transition-colors hover:bg-zinc-50 active:opacity-80"
        aria-label="Restar"
        onClick={(e) => {
          e.stopPropagation()
          onDecrement()
        }}
      >
        <Minus className="h-5 w-5" strokeWidth={2.5} />
      </button>
      <div className="flex min-h-12 min-w-[56px] shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-sm font-black text-zinc-900">
        {quantity === 0 ? ' ' : quantity}
      </div>
      <button
        type="button"
        className="flex min-h-12 min-w-[48px] shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-800 transition-colors hover:bg-zinc-50 active:opacity-80"
        aria-label="Sumar"
        onClick={(e) => {
          e.stopPropagation()
          onIncrement()
        }}
      >
        <Plus className="h-5 w-5" strokeWidth={2.5} />
      </button>
    </div>
  )
}
