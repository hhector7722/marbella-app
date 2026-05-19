'use client'

import { cn } from '@/lib/utils'
import type { CartaLang } from '@/lib/carta-menu-i18n'
import { platoMarbellaPlateSlotLabels, type PlatoMarbellaSlot } from '@/lib/carta-plato-marbella'

const SLOT_ORDER: PlatoMarbellaSlot[] = ['entrante', 'principal', 'guarnicion']

/** Geometría compartida (viewBox 200×200): plato SVG e indicadores usan los mismos porcentajes. */
const PLATE_G = {
  inset: 8,
  cx: 100,
  cy: 100,
  r: 92,
  divY: 76,
  divX: 100,
  bottom: 176,
} as const

const SLOT_REGION: Record<PlatoMarbellaSlot, { className: string }> = {
  entrante: {
    className:
      'left-[4%] right-[4%] top-[4%] h-[34%] rounded-t-[50%] rounded-b-none',
  },
  principal: {
    className:
      'left-[4%] top-[38%] h-[50%] w-[46%] rounded-bl-[1rem] rounded-tl-sm rounded-br-none rounded-tr-none',
  },
  guarnicion: {
    className:
      'right-[4%] top-[38%] h-[50%] w-[46%] rounded-br-[1rem] rounded-tr-sm rounded-bl-none rounded-tl-none',
  },
}

const SLOT_LABEL_CLASS =
  'pointer-events-none text-center font-sans text-[8.5px] font-semibold leading-tight tracking-[0.03em] antialiased sm:text-[9.5px]'

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
    <div
      className={cn('mx-auto w-full max-w-[11rem] sm:max-w-[12rem]', className)}
      role="tablist"
    >
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
          <circle
            cx={PLATE_G.cx}
            cy={PLATE_G.cy}
            r={PLATE_G.r}
            fill="url(#pm-plate-shine)"
            stroke="#e4e4e7"
            strokeWidth="2"
          />
          <circle
            cx={PLATE_G.cx}
            cy={PLATE_G.cy}
            r={PLATE_G.r - 14}
            fill="none"
            stroke="#f4f4f5"
            strokeWidth="1"
          />
          <line
            x1={PLATE_G.inset}
            y1={PLATE_G.divY}
            x2={200 - PLATE_G.inset}
            y2={PLATE_G.divY}
            stroke="#e4e4e7"
            strokeWidth="1.5"
          />
          <line
            x1={PLATE_G.divX}
            y1={PLATE_G.divY}
            x2={PLATE_G.divX}
            y2={PLATE_G.bottom}
            stroke="#e4e4e7"
            strokeWidth="1.5"
          />
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
                'absolute z-10 flex touch-manipulation items-center justify-center overflow-hidden border-0 p-0 transition-colors duration-200 ease-out',
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
            </button>
          )
        })}
      </div>
    </div>
  )
}
