'use client'

import { cn } from '@/lib/utils'
import type { CartaLang } from '@/lib/carta-menu-i18n'
import { tPlatoMarbellaUi } from '@/lib/carta-menu-i18n'
import { platoMarbellaSlotsForLang, type PlatoMarbellaSlot } from '@/lib/carta-plato-marbella'

const SLOT_LAYOUT: Record<
  PlatoMarbellaSlot,
  { labelClass: string; bubbleClass: string }
> = {
  entrante: {
    labelClass: 'left-[8%] top-[6%]',
    bubbleClass: 'left-[14%] top-[12%]',
  },
  principal: {
    labelClass: 'left-1/2 top-[38%] -translate-x-1/2',
    bubbleClass: 'left-1/2 top-[44%] -translate-x-1/2',
  },
  guarnicion: {
    labelClass: 'right-[8%] top-[6%]',
    bubbleClass: 'right-[14%] top-[12%]',
  },
}

const SLOT_ORDER: PlatoMarbellaSlot[] = ['entrante', 'principal', 'guarnicion']

export type PlatoMarbellaPlateSelection = {
  name: string
  photoUrl: string | null
}

export function PlatoMarbellaPlateVisual({
  lang,
  selections,
  className,
}: {
  lang: CartaLang
  selections: Record<PlatoMarbellaSlot, PlatoMarbellaPlateSelection | null>
  className?: string
}) {
  const ui = tPlatoMarbellaUi(lang)
  const slotLabels = platoMarbellaSlotsForLang(lang)
  const filled = SLOT_ORDER.filter((s) => selections[s] != null).length

  return (
    <div className={cn('mx-auto w-full max-w-[17rem] sm:max-w-xs', className)}>
      <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-500 sm:text-[11px]">
        {ui.plateHint}
      </p>
      <div className="relative mx-auto aspect-square w-full max-w-[15rem] sm:max-w-[16rem]">
        <svg
          viewBox="0 0 200 200"
          className="h-full w-full drop-shadow-sm"
          aria-hidden
        >
          <ellipse cx="100" cy="108" rx="88" ry="78" fill="#f4f4f5" stroke="#d4d4d8" strokeWidth="2" />
          <ellipse cx="100" cy="108" rx="72" ry="62" fill="#fafafa" stroke="#e4e4e7" strokeWidth="1" />
        </svg>

        {SLOT_ORDER.map((slot) => {
          const sel = selections[slot]
          const layout = SLOT_LAYOUT[slot]
          return (
            <div key={slot}>
              <span
                className={cn(
                  'pointer-events-none absolute z-20 max-w-[30%] truncate text-center text-[8px] font-black uppercase tracking-wide text-[#36606F]/80 sm:text-[9px]',
                  layout.labelClass
                )}
              >
                {slotLabels[slot]}
              </span>
              <div
                className={cn(
                  'absolute z-10 flex h-[26%] w-[26%] min-h-[48px] min-w-[48px] flex-col items-center justify-center overflow-hidden rounded-full border-2 bg-white shadow-sm transition-colors',
                  layout.bubbleClass,
                  sel
                    ? 'border-[#36606F] bg-[#36606F]/5'
                    : 'border-dashed border-zinc-300 bg-zinc-50/90'
                )}
                aria-label={
                  sel
                    ? `${slotLabels[slot]}: ${sel.name}`
                    : `${slotLabels[slot]}: ${ui.plateEmptySlot}`
                }
              >
                {sel?.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sel.photoUrl} alt="" className="h-full w-full object-cover" />
                ) : sel ? (
                  <span className="line-clamp-3 px-1 text-center text-[8px] font-bold leading-tight text-zinc-800 sm:text-[9px]">
                    {sel.name}
                  </span>
                ) : (
                  <span className="text-lg font-black text-zinc-300" aria-hidden>
                    {slot === 'entrante' ? '1' : slot === 'principal' ? '2' : '3'}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <p
        className={cn(
          'mt-2 text-center text-[11px] font-bold sm:text-xs',
          filled === 3 ? 'text-emerald-700' : 'text-zinc-500'
        )}
      >
        {filled === 3 ? ui.plateComplete : ui.plateProgress.replace('{n}', String(filled))}
      </p>
    </div>
  )
}
