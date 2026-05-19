'use client'

import { cn } from '@/lib/utils'
import type { CartaLang } from '@/lib/carta-menu-i18n'
import { platoMarbellaPlateSlotLabels, type PlatoMarbellaSlot } from '@/lib/carta-plato-marbella'

const SLOT_ORDER: PlatoMarbellaSlot[] = ['entrante', 'principal', 'guarnicion']

const SLOT_REGION: Record<
  PlatoMarbellaSlot,
  { className: string; labelClass: string }
> = {
  entrante: {
    className: 'left-[7%] right-[7%] top-[6%] h-[38%] rounded-t-[999px] rounded-b-md',
    labelClass: 'top-1/2 -translate-y-[55%]',
  },
  principal: {
    className: 'bottom-[7%] left-[7%] h-[44%] w-[42%] rounded-bl-[1.25rem] rounded-br-md rounded-tl-md',
    labelClass: 'top-1/2 -translate-y-1/2',
  },
  guarnicion: {
    className: 'bottom-[7%] right-[7%] h-[44%] w-[42%] rounded-br-[1.25rem] rounded-bl-md rounded-tr-md',
    labelClass: 'top-1/2 -translate-y-1/2',
  },
}

const PLATE_LABEL_CLASS =
  'pointer-events-none absolute inset-x-0.5 text-center font-sans text-[8.5px] font-semibold leading-[1.2] tracking-[0.03em] antialiased sm:text-[9.5px]'

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
          <line x1="20" y1="101" x2="180" y2="101" stroke="#e4e4e7" strokeWidth="1.5" />
          <line x1="100" y1="101" x2="100" y2="176" stroke="#e4e4e7" strokeWidth="1.5" />
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
              aria-label={slotLabels[slot]}
              className={cn(
                'absolute z-10 flex min-h-[40px] touch-manipulation flex-col items-center justify-center border-0 transition-all duration-200 ease-out',
                region.className,
                isActive
                  ? 'z-20 bg-[#36606F]/16'
                  : 'bg-transparent hover:bg-[#36606F]/8 active:bg-[#36606F]/12'
              )}
              onClick={() => onSlotChange(slot)}
            >
              <span
                className={cn(
                  PLATE_LABEL_CLASS,
                  region.labelClass,
                  isActive ? 'font-bold text-[#36606F]' : 'text-zinc-500/85'
                )}
              >
                {slotLabels[slot]}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
