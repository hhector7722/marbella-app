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
    className: 'left-[6%] right-[6%] top-[5%] h-[40%] rounded-t-[999px] rounded-b-lg',
    labelClass: 'top-1/2 -translate-y-[58%]',
  },
  principal: {
    className: 'bottom-[6%] left-[6%] h-[46%] w-[43%] rounded-bl-[2rem] rounded-br-lg rounded-tl-lg',
    labelClass: 'top-1/2 -translate-y-1/2',
  },
  guarnicion: {
    className: 'bottom-[6%] right-[6%] h-[46%] w-[43%] rounded-br-[2rem] rounded-bl-lg rounded-tr-lg',
    labelClass: 'top-1/2 -translate-y-1/2',
  },
}

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
    <div className={cn('mx-auto w-full max-w-[18rem] sm:max-w-xs', className)} role="tablist">
      <div className="relative mx-auto aspect-square w-full max-w-[16rem] sm:max-w-[17rem]">
        <svg
          viewBox="0 0 200 200"
          className="pointer-events-none absolute inset-0 h-full w-full drop-shadow-md"
          aria-hidden
        >
          <defs>
            <radialGradient id="pm-plate-shine" cx="35%" cy="28%" r="65%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="55%" stopColor="#f4f4f5" />
              <stop offset="100%" stopColor="#e4e4e7" />
            </radialGradient>
          </defs>
          <circle cx="100" cy="100" r="92" fill="url(#pm-plate-shine)" stroke="#d4d4d8" strokeWidth="2.5" />
          <circle cx="100" cy="100" r="78" fill="none" stroke="#e4e4e7" strokeWidth="1.5" />
          <line x1="18" y1="102" x2="182" y2="102" stroke="#d4d4d8" strokeWidth="2" />
          <line x1="100" y1="102" x2="100" y2="178" stroke="#d4d4d8" strokeWidth="2" />
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
                'absolute z-10 flex min-h-[48px] touch-manipulation flex-col items-center justify-center border-2 transition-colors',
                region.className,
                isActive
                  ? 'border-[#36606F] bg-[#36606F]/8 shadow-inner'
                  : 'border-transparent bg-white/40 hover:bg-white/70 active:bg-zinc-100/90'
              )}
              onClick={() => onSlotChange(slot)}
            >
              <span
                className={cn(
                  'pointer-events-none absolute inset-x-2 text-center text-[9px] font-black uppercase leading-tight tracking-[0.14em] text-zinc-900 sm:text-[10px]',
                  region.labelClass,
                  isActive && 'text-[#36606F]'
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
