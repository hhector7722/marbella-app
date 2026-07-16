'use client'

import { Plus } from 'lucide-react'

import { formatCartaPrice } from '@/lib/carta-price-display'
import { cn } from '@/lib/utils'

/** Controles Entero / Medio para pedido sobre carta (bocadillos y extras emparejados). */
export function EventCartaDualRacionOrderControls({
  racionEntero,
  racionMedio,
  precioEntero,
  precioMedio,
  qtyEntero,
  qtyMedio,
  onAddEntero,
  onAddMedio,
  className,
}: {
  racionEntero: string
  racionMedio: string
  precioEntero: number | string | null | undefined
  precioMedio: number | string | null | undefined
  qtyEntero: number
  qtyMedio: number
  onAddEntero: () => void
  onAddMedio: () => void
  className?: string
}) {
  const priceEntero = formatCartaPrice(precioEntero)
  const priceMedio = formatCartaPrice(precioMedio)

  return (
    <div className={cn('mt-1 grid w-full grid-cols-2 gap-1.5', className)}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onAddEntero()
        }}
        className="relative flex min-h-12 flex-col items-center justify-center rounded-xl border border-zinc-200 bg-white px-1 py-1.5 active:bg-zinc-50"
        aria-label={`Añadir ${racionEntero}`}
      >
        <span className="text-[10px] font-black uppercase tracking-wide text-[#36606F]">
          {racionEntero}
        </span>
        {priceEntero.trim() ? (
          <span className="text-[11px] font-black tabular-nums text-zinc-800">{priceEntero}</span>
        ) : null}
        <Plus className="mt-0.5 h-3.5 w-3.5 text-zinc-400" strokeWidth={2.5} aria-hidden />
        {qtyEntero > 0 ? (
          <span className="absolute -right-1 -top-1 min-h-5 min-w-5 rounded-full bg-[#36606F] px-1 text-[10px] font-black leading-5 text-white">
            ×{qtyEntero}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onAddMedio()
        }}
        className="relative flex min-h-12 flex-col items-center justify-center rounded-xl border border-zinc-200 bg-white px-1 py-1.5 active:bg-zinc-50"
        aria-label={`Añadir ${racionMedio}`}
      >
        <span className="text-[10px] font-black uppercase tracking-wide text-[#36606F]">
          {racionMedio}
        </span>
        {priceMedio.trim() ? (
          <span className="text-[11px] font-black tabular-nums text-zinc-800">{priceMedio}</span>
        ) : null}
        <Plus className="mt-0.5 h-3.5 w-3.5 text-zinc-400" strokeWidth={2.5} aria-hidden />
        {qtyMedio > 0 ? (
          <span className="absolute -right-1 -top-1 min-h-5 min-w-5 rounded-full bg-[#36606F] px-1 text-[10px] font-black leading-5 text-white">
            ×{qtyMedio}
          </span>
        ) : null}
      </button>
    </div>
  )
}
