'use client'

import { cn } from '@/lib/utils'
import { formatCartaPrice, formatCartaPriceAriaAmount } from '@/lib/carta-price-display'

type CartaDualRacionPricesProps = {
  racionEntero: string
  racionMedio: string
  precio: number | string | null | undefined
  precioMedio?: number | string | null | undefined
  variant?: 'public' | 'staff'
  /** Fichas cuadradas: mostrar los precios de entero y medio en una sola fila. */
  singleLine?: boolean
}

function buildDualRacionAriaLabel(
  labels: { racionEntero: string; racionMedio: string },
  enteroPrice: number | string | null | undefined,
  medioPrice: number | string | null | undefined
): string {
  const enteroAmt = formatCartaPriceAriaAmount(enteroPrice)
  const medioAmt = formatCartaPriceAriaAmount(medioPrice)
  if (!enteroAmt || !medioAmt) return ''
  return `${labels.racionEntero} ${enteroAmt}, ${labels.racionMedio} ${medioAmt}`
}

export function CartaDualRacionPrices({
  racionEntero,
  racionMedio,
  precio,
  precioMedio,
  variant = 'public',
  singleLine = false,
}: CartaDualRacionPricesProps) {
  const priceStr = formatCartaPrice(precio)
  const priceMedioStr = formatCartaPrice(precioMedio ?? null)
  const showPrice = priceStr.trim() !== ''
  const showMedio = priceMedioStr.trim() !== ''

  const enteroSizeClass =
    variant === 'staff'
      ? 'text-[clamp(9px,1.2vw,11px)]'
      : 'text-xs sm:text-[11px]'
  const medioSizeClass =
    variant === 'staff'
      ? 'text-[clamp(8px,1.1vw,10px)]'
      : 'text-[11px]'

  if (!showPrice && !showMedio) {
    return (
      <span
        className={cn(
          'min-h-[1em] font-mono text-transparent select-none',
          enteroSizeClass
        )}
        aria-hidden
      >
        {' '}
      </span>
    )
  }

  if (showPrice && showMedio && singleLine) {
    const ariaLabel = buildDualRacionAriaLabel({ racionEntero, racionMedio }, precio, precioMedio)
    return (
      <div
        data-carta-price-lines
        data-carta-price-compact="true"
        role="group"
        aria-label={ariaLabel || undefined}
        className="flex w-full min-w-0 items-center justify-center whitespace-nowrap"
      >
        <span title={ariaLabel || undefined} className="whitespace-nowrap text-center font-bold tabular-nums">
          {racionEntero.trim().charAt(0).toUpperCase()} {priceStr} · {racionMedio.trim().charAt(0).toUpperCase()} {priceMedioStr}
        </span>
      </div>
    )
  }

  if (showPrice && showMedio) {
    const ariaLabel = buildDualRacionAriaLabel({ racionEntero, racionMedio }, precio, precioMedio)
    return (
      <div
        role="group"
        data-carta-price-lines
        className="flex min-h-0 w-full shrink-0 flex-col items-center justify-center gap-1 py-0"
        aria-label={ariaLabel || undefined}
      >
        <span
          className={cn(
            'text-center font-black tabular-nums leading-tight text-[#36606F]',
            variant === 'staff' && 'font-mono leading-none',
            enteroSizeClass
          )}
        >
          <span className="font-bold">{racionEntero}</span>
          <span className="mx-0.5 font-normal opacity-70" aria-hidden>
            ·
          </span>
          {priceStr}
        </span>
        <span
          className={cn(
            'text-center font-black tabular-nums leading-tight text-[#36606F]/90',
            variant === 'staff' && 'font-mono leading-none',
            medioSizeClass
          )}
        >
          <span className="font-bold">{racionMedio}</span>
          <span className="mx-0.5 font-normal opacity-70" aria-hidden>
            ·
          </span>
          {priceMedioStr}
        </span>
      </div>
    )
  }

  if (showPrice) {
    return (
      <div data-carta-price-lines
        className="flex min-h-0 w-full shrink-0 flex-col items-center justify-center gap-1 py-0">
        <span
          className={cn(
            'text-center font-black tabular-nums leading-tight text-[#36606F]',
            variant === 'staff' && 'font-mono',
            enteroSizeClass
          )}
        >
          {priceStr}
        </span>
      </div>
    )
  }

  return (
    <div data-carta-price-lines
        className="flex min-h-0 w-full shrink-0 flex-col items-center justify-center gap-1 py-0">
      <span
        className={cn(
          'text-center font-black tabular-nums leading-tight text-[#36606F]/90',
          variant === 'staff' && 'font-mono',
          medioSizeClass
        )}
      >
        {priceMedioStr}
      </span>
    </div>
  )
}
