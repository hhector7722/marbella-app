'use client'

import { cn } from '@/lib/utils'
import { type CartaLang } from '@/lib/carta-menu-i18n'
import { useCartaRacionLabels } from '@/lib/carta-racion-labels-context'
import { formatCartaPrice, formatCartaPriceAriaAmount } from '@/lib/carta-price-display'

type CartaDualRacionPricesProps = {
  lang: CartaLang
  precio: number | string | null | undefined
  precioMedio?: number | string | null | undefined
  variant?: 'public' | 'staff'
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
  lang,
  precio,
  precioMedio,
  variant = 'public',
}: CartaDualRacionPricesProps) {
  const t = useCartaRacionLabels(lang)
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

  if (showPrice && showMedio) {
    const ariaLabel = buildDualRacionAriaLabel(t, precio, precioMedio)
    return (
      <div
        role="group"
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
          <span className="font-bold">{t.racionEntero}</span>
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
          <span className="font-bold">{t.racionMedio}</span>
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
      <div className="flex min-h-0 w-full shrink-0 flex-col items-center justify-center gap-1 py-0">
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
    <div className="flex min-h-0 w-full shrink-0 flex-col items-center justify-center gap-1 py-0">
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
