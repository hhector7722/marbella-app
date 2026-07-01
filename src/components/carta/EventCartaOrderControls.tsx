'use client'

import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

export function EventCartaOrderControls({
  quantity,
  onIncrement,
  onDecrement,
  onChange,
  className,
}: {
  quantity: number
  onIncrement: () => void
  onDecrement: () => void
  onChange?: (qty: number) => void
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between w-full min-h-11 bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm transition-all focus-within:ring-2 focus-within:ring-[#5B8FB9]/40 focus-within:border-[#5B8FB9]/40', className)}>
      <button
        type="button"
        className="w-10 h-11 flex items-center justify-center text-zinc-400 hover:bg-rose-50 hover:text-rose-500 active:bg-rose-100 transition-colors shrink-0"
        aria-label="Restar"
        onClick={(e) => {
          e.stopPropagation()
          onDecrement()
        }}
      >
        <Minus size={18} strokeWidth={3} />
      </button>
      
      <input
        type="number"
        min={0}
        max={999}
        value={quantity === 0 ? '' : quantity}
        onChange={(e) => {
          if (!onChange) return;
          const val = e.target.value;
          if (val === '') {
            onChange(0);
          } else {
            const num = parseInt(val, 10);
            if (!isNaN(num)) {
              onChange(num);
            }
          }
        }}
        className="flex-1 w-0 h-11 bg-transparent text-center font-black text-zinc-700 text-sm tabular-nums outline-none p-0 focus:bg-blue-50/10 transition-colors"
      />

      <button
        type="button"
        className="w-10 h-11 flex items-center justify-center text-zinc-400 hover:bg-emerald-50 hover:text-emerald-500 active:bg-emerald-100 transition-colors shrink-0"
        aria-label="Sumar"
        onClick={(e) => {
          e.stopPropagation()
          onIncrement()
        }}
      >
        <Plus size={18} strokeWidth={3} />
      </button>
    </div>
  )
}
