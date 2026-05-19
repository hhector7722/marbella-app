'use client'

import { useId } from 'react'
import { cn } from '@/lib/utils'
import type { CartaLang } from '@/lib/carta-menu-i18n'
import { PLATO_MARBELLA_BRAND } from '@/components/carta/PlatoMarbellaModalHeaderBar'
import { platoMarbellaPlateSlotLabels, type PlatoMarbellaSlot } from '@/lib/carta-plato-marbella'

const SLOT_ORDER: PlatoMarbellaSlot[] = ['entrante', 'principal', 'guarnicion']

/** Geometría compartida (viewBox 200×200): plato, líneas y zonas táctiles coinciden. */
const PLATE_G = {
  inset: 8,
  cx: 100,
  cy: 100,
  r: 92,
  divY: 76,
  divX: 100,
} as const

const PLATE_BOTTOM = PLATE_G.cy + PLATE_G.r

/** Rectángulos recortados al círculo del plato → sectores circulares perfectos. */
const SLOT_RECT: Record<PlatoMarbellaSlot, string> = {
  entrante: `M ${PLATE_G.inset} ${PLATE_G.inset} H ${200 - PLATE_G.inset} V ${PLATE_G.divY} H ${PLATE_G.inset} Z`,
  principal: `M ${PLATE_G.inset} ${PLATE_G.divY} H ${PLATE_G.divX} V ${PLATE_BOTTOM} H ${PLATE_G.inset} Z`,
  guarnicion: `M ${PLATE_G.divX} ${PLATE_G.divY} H ${200 - PLATE_G.inset} V ${PLATE_BOTTOM} H ${PLATE_G.divX} Z`,
}

const SLOT_LABEL_POS: Record<PlatoMarbellaSlot, { x: number; y: number }> = {
  entrante: { x: PLATE_G.cx, y: 44 },
  principal: { x: 52, y: 122 },
  guarnicion: { x: 148, y: 122 },
}

const PM_STROKE_INACTIVE = 'rgba(54, 96, 111, 0.2)'

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
  const uid = useId().replace(/:/g, '')
  const clipId = `pm-plate-clip-${uid}`
  const shineId = `pm-plate-shine-${uid}`
  const slotLabels = platoMarbellaPlateSlotLabels(lang)

  return (
    <div
      className={cn('mx-auto w-full max-w-[11rem] sm:max-w-[12rem]', className)}
      role="tablist"
      aria-label="Seleccionar tramo del plato"
    >
      <svg
        viewBox="0 0 200 200"
        className="mx-auto aspect-square w-full drop-shadow-sm"
      >
        <defs>
          <clipPath id={clipId}>
            <circle cx={PLATE_G.cx} cy={PLATE_G.cy} r={PLATE_G.r} />
          </clipPath>
          <radialGradient id={shineId} cx="38%" cy="30%" r="62%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="50%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#ececef" />
          </radialGradient>
        </defs>

        {/* Plato base (círculo) */}
        <circle
          cx={PLATE_G.cx}
          cy={PLATE_G.cy}
          r={PLATE_G.r}
          fill={`url(#${shineId})`}
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

        {/* Zonas táctiles (misma geometría que las líneas, recortadas al círculo) */}
        <g clipPath={`url(#${clipId})`}>
          {SLOT_ORDER.map((slot) => {
            const isActive = activeSlot === slot
            return (
              <path
                key={slot}
                role="tab"
                tabIndex={0}
                aria-selected={isActive}
                aria-label={slotLabels[slot]}
                d={SLOT_RECT[slot]}
                fill={isActive ? 'rgba(54, 96, 111, 0.12)' : 'transparent'}
                stroke={isActive ? PLATO_MARBELLA_BRAND : PM_STROKE_INACTIVE}
                strokeWidth={isActive ? 2.5 : 1}
                className="cursor-pointer touch-manipulation outline-none transition-[fill,stroke] duration-200 ease-out hover:fill-[rgba(54,96,111,0.08)]"
                onClick={() => onSlotChange(slot)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSlotChange(slot)
                  }
                }}
              />
            )
          })}
        </g>

        {/* Líneas de división (encima de las zonas) */}
        <line
          x1={PLATE_G.inset}
          y1={PLATE_G.divY}
          x2={200 - PLATE_G.inset}
          y2={PLATE_G.divY}
          stroke="#e4e4e7"
          strokeWidth="1.5"
          pointerEvents="none"
        />
        <line
          x1={PLATE_G.divX}
          y1={PLATE_G.divY}
          x2={PLATE_G.divX}
          y2={PLATE_BOTTOM}
          stroke="#e4e4e7"
          strokeWidth="1.5"
          pointerEvents="none"
        />

        {/* Etiquetas centradas en cada sector */}
        {SLOT_ORDER.map((slot) => {
          const pos = SLOT_LABEL_POS[slot]
          const isActive = activeSlot === slot
          return (
            <text
              key={`label-${slot}`}
              x={pos.x}
              y={pos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              pointerEvents="none"
              className={cn(
                'select-none font-sans text-[10.5px] tracking-[0.03em] antialiased sm:text-[12px]',
                isActive ? 'fill-[#36606F] font-black' : 'fill-zinc-600 font-semibold'
              )}
            >
              {slotLabels[slot]}
            </text>
          )
        })}
      </svg>
    </div>
  )
}
