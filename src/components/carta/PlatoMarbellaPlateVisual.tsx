'use client'

import { cn } from '@/lib/utils'
import { tPlatoMarbellaUi, type CartaLang } from '@/lib/carta-menu-i18n'
import { platoMarbellaPlateSlotLabels, type PlatoMarbellaSlot } from '@/lib/carta-plato-marbella'

const SLOT_ORDER: PlatoMarbellaSlot[] = ['entrante', 'principal', 'guarnicion']

const SLOT_REGION: Record<PlatoMarbellaSlot, { className: string }> = {
  entrante: {
    className: 'left-[7%] right-[7%] top-[6%] h-[30%] rounded-t-[999px] rounded-b-md',
  },
  principal: {
    className: 'bottom-[6%] left-[7%] h-[52%] w-[42%] rounded-bl-[1.25rem] rounded-br-md rounded-tl-md',
  },
  guarnicion: {
    className: 'bottom-[6%] right-[7%] h-[52%] w-[42%] rounded-br-[1.25rem] rounded-bl-md rounded-tr-md',
  },
}

const SLOT_LABEL_CLASS =
  'pointer-events-none text-center font-sans text-[8.5px] font-semibold leading-tight tracking-[0.03em] antialiased sm:text-[9.5px]'

const SLOT_HINT_CLASS =
  'pointer-events-none mt-0.5 text-center font-sans text-[7px] font-bold uppercase leading-none tracking-[0.08em] antialiased sm:text-[7.5px]'

export function PlatoMarbellaPlateVisual({
  lang,
  activeSlot,
  onSlotChange,
  className,
}: {
  lang: CartaLang
  activeSlot: PlatoMarbellaSlot
  onSlotChange: (slot: PlatoMarbellaSlot) => void
  className?: string
}) {
  const ui = tPlatoMarbellaUi(lang)
  const slotLabels = platoMarbellaPlateSlotLabels(lang)

  return (
    <div className={cn('mx-auto w-full max-w-[9.75rem] sm:max-w-[10.5rem]', className)} role="tablist">
      <div className="relative mx-auto aspect-square w-full">
        <svg
          viewBox="0 0 200 200"
          className="pointer-events-none absolute inset-0 h-full w-full drop-shadow-sm"
          aria-hidden
        >
          <defs>
            <radialGradient id="pm-plate-shine" cx="38%" cy="30%" r="62%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="50%" stopColor="#f8fafc" />
              <stop offset="100%" stopColor="#ececef" />
            </radialGradient>
          </defs>
          <circle cx="100" cy="100" r="92" fill="url(#pm-plate-shine)" stroke="#e4e4e7" strokeWidth="2" />
          <circle cx="100" cy="100" r="78" fill="none" stroke="#f4f4f5" strokeWidth="1" />
          <line x1="20" y1="76" x2="180" y2="76" stroke="#e4e4e7" strokeWidth="1.5" />
          <line x1="100" y1="76" x2="100" y2="176" stroke="#e4e4e7" strokeWidth="1.5" />
        </svg>

        {SLOT_ORDER.map((slot) => {
          const region = SLOT_REGION[slot]
          const isActive = activeSlot === slot
          return (
            <button
              key={slot}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={
                isActive
                  ? `${slotLabels[slot]} — ${ui.plateActiveHere}`
                  : `${slotLabels[slot]} — ${ui.plateTapZone}`
              }
              className={cn(
                'absolute z-10 flex min-h-[40px] touch-manipulation flex-col items-center justify-center overflow-hidden border-0 px-1 transition-colors duration-200 ease-out',
                region.className,
                isActive
                  ? 'z-20 bg-[#36606F]/14 shadow-[inset_0_0_0_2px_rgba(54,96,111,0.55)]'
                  : 'bg-transparent shadow-[inset_0_0_0_1px_rgba(54,96,111,0.18)] hover:bg-[#36606F]/8 hover:shadow-[inset_0_0_0_1.5px_rgba(54,96,111,0.32)] active:bg-[#36606F]/12'
              )}
              onClick={() => onSlotChange(slot)}
            >
              <span
                className={cn(
                  SLOT_LABEL_CLASS,
                  isActive ? 'font-black text-[#36606F]' : 'font-semibold text-zinc-600'
                )}
              >
                {slotLabels[slot]}
              </span>
              <span
                className={cn(
                  SLOT_HINT_CLASS,
                  isActive ? 'text-[#36606F]/90' : 'text-[#36606F]/55'
                )}
              >
                {isActive ? ui.plateActiveHere : ui.plateTapZone}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
