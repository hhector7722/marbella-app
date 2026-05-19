'use client'

import { formatPlatoMarbellaMenuPrice } from '@/lib/carta-plato-marbella'
import { tPlatoMarbellaUi, type CartaLang } from '@/lib/carta-menu-i18n'

export function PlatoMarbellaModalSubheader({
  subTitle,
  menuPrice,
}: {
  /** Si null, solo se muestra el precio (p. ej. con pestañas de subcategoría). */
  subTitle?: string | null
  menuPrice: number | null
}) {
  return (
    <div className="shrink-0 space-y-0.5 px-3 pb-1.5 pt-0.5 text-center">
      {subTitle ? (
        <p className="text-[11px] font-black uppercase leading-tight tracking-wide text-[#36606F] sm:text-xs">
          {subTitle}
        </p>
      ) : null}
      <p className="text-xl font-black tabular-nums leading-none text-[#36606F] sm:text-2xl">
        {formatPlatoMarbellaMenuPrice(menuPrice)}
      </p>
    </div>
  )
}

export function PlatoMarbellaModalScheduleFooter({ lang }: { lang: CartaLang }) {
  const ui = tPlatoMarbellaUi(lang)
  return (
    <div className="shrink-0 bg-white px-3 py-2.5 text-center sm:py-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[#36606F]/70 sm:text-[11px]">
        {ui.schedule}
      </p>
    </div>
  )
}
