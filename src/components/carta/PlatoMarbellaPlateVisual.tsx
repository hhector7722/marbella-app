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
const PLATE_RIGHT = 200 - PLATE_G.inset

/** Rectángulos recortados al círculo del plato → sectores circulares (solo relleno / hit area). */
const SLOT_RECT: Record<PlatoMarbellaSlot, string> = {
  entrante: `M ${PLATE_G.inset} ${PLATE_G.inset} H ${PLATE_RIGHT} V ${PLATE_G.divY} H ${PLATE_G.inset} Z`,
  principal: `M ${PLATE_G.inset} ${PLATE_G.divY} H ${PLATE_G.divX} V ${PLATE_BOTTOM} H ${PLATE_G.inset} Z`,
  guarnicion: `M ${PLATE_G.divX} ${PLATE_G.divY} H ${PLATE_RIGHT} V ${PLATE_BOTTOM} H ${PLATE_G.divX} Z`,
}

/** Lados interiores rectos (nunca el arco del círculo). */
type InnerEdge = { x1: number; y1: number; x2: number; y2: number }

const SLOT_INNER_EDGES: Record<PlatoMarbellaSlot, InnerEdge[]> = {
  entrante: [{ x1: PLATE_G.inset, y1: PLATE_G.divY, x2: PLATE_RIGHT, y2: PLATE_G.divY }],
  principal: [
    { x1: PLATE_G.inset, y1: PLATE_G.divY, x2: PLATE_G.divX, y2: PLATE_G.divY },
    { x1: PLATE_G.divX, y1: PLATE_G.divY, x2: PLATE_G.divX, y2: PLATE_BOTTOM },
  ],
  guarnicion: [
    { x1: PLATE_G.divX, y1: PLATE_G.divY, x2: PLATE_RIGHT, y2: PLATE_G.divY },
    { x1: PLATE_G.divX, y1: PLATE_G.divY, x2: PLATE_G.divX, y2: PLATE_BOTTOM },
  ],
}

const SLOT_LABEL_POS: Record<PlatoMarbellaSlot, { x: number; y: number }> = {
  entrante: { x: PLATE_G.cx, y: 44 },
  principal: { x: 52, y: 122 },
  guarnicion: { x: 148, y: 122 },
}

const PM_FILL_REST = 'rgba(54, 96, 111, 0.04)'
const PM_FILL_ACTIVE_PEAK = 'rgba(54, 96, 111, 0.17)'
const PM_DIVIDER_STROKE = '#e4e4e7'

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
  const fillAnim = `pm-zone-fill-${uid}`
  const lineAnim = `pm-zone-line-${uid}`
  const slotLabels = platoMarbellaPlateSlotLabels(lang)

  return (
    <div
      className={cn('mx-auto w-full max-w-[11rem] sm:max-w-[12rem]', className)}
      role="tablist"
      aria-label="Seleccionar tramo del plato"
    >
      <style>{`
        @keyframes ${fillAnim} {
          0%, 100% { fill: ${PM_FILL_ACTIVE_PEAK}; }
          50% { fill: ${PM_FILL_REST}; }
        }
        @keyframes ${lineAnim} {
          0%, 100% { stroke: ${PLATO_MARBELLA_BRAND}; stroke-opacity: 1; }
          50% { stroke: ${PLATO_MARBELLA_BRAND}; stroke-opacity: 0.22; }
        }
        .${fillAnim} {
          animation: ${fillAnim} 2.6s ease-in-out infinite;
        }
        .${lineAnim} {
          animation: ${lineAnim} 2.6s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .${fillAnim} {
            animation: none;
            fill: rgba(54, 96, 111, 0.12);
          }
          .${lineAnim} {
            animation: none;
            stroke-opacity: 0.85;
          }
        }
      `}</style>

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

        <circle
          cx={PLATE_G.cx}
          cy={PLATE_G.cy}
          r={PLATE_G.r}
          fill={`url(#${shineId})`}
          stroke={PM_DIVIDER_STROKE}
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
                fill={isActive ? PM_FILL_ACTIVE_PEAK : 'transparent'}
                stroke="none"
                className={cn(
                  'cursor-pointer touch-manipulation outline-none',
                  isActive ? fillAnim : 'transition-[fill] duration-200 hover:fill-[rgba(54,96,111,0.07)]'
                )}
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

        {/* Divisores base del plato (neutros) */}
        <line
          x1={PLATE_G.inset}
          y1={PLATE_G.divY}
          x2={PLATE_RIGHT}
          y2={PLATE_G.divY}
          stroke={PM_DIVIDER_STROKE}
          strokeWidth="1.5"
          pointerEvents="none"
        />
        <line
          x1={PLATE_G.divX}
          y1={PLATE_G.divY}
          x2={PLATE_G.divX}
          y2={PLATE_BOTTOM}
          stroke={PM_DIVIDER_STROKE}
          strokeWidth="1.5"
          pointerEvents="none"
        />

        {/* Contorno interior animado (solo lados rectos de la zona activa) */}
        <g pointerEvents="none">
          {SLOT_INNER_EDGES[activeSlot].map((edge, i) => (
            <line
              key={`${activeSlot}-edge-${i}`}
              x1={edge.x1}
              y1={edge.y1}
              x2={edge.x2}
              y2={edge.y2}
              stroke={PLATO_MARBELLA_BRAND}
              strokeWidth="1.5"
              strokeLinecap="round"
              className={lineAnim}
            />
          ))}
        </g>

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
                'select-none font-sans text-[12px] tracking-[0.03em] antialiased sm:text-[14px]',
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
