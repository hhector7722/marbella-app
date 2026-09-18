'use client'

import { Children, isValidElement, useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { CartaLang } from '@/lib/carta-menu-i18n'
import {
  platoMarbellaPlateSlotLabels,
  type PlatoMarbellaSlot,
} from '@/lib/carta-plato-marbella'
import { useStudioCutout } from '@/components/carta/useStudioCutout'

/** Alimento colocado en una zona del plato (null = zona vacía). */
export type PlateZoneItem = {
  photoUrl: string | null
  label: string
  /** Clave de remontaje (p. ej. articulo_id) para repetir la animación de entrada. */
  id?: string
}

const SLOT_ORDER: PlatoMarbellaSlot[] = ['entrante', 'principal', 'guarnicion']
/** Pintado de atrás hacia adelante: el principal queda debajo, la guarnición delante. */
const PAINT_ORDER: PlatoMarbellaSlot[] = ['principal', 'entrante', 'guarnicion']

/**
 * Plato llano visto desde arriba (viewBox 280×268). Un solo hueco de porcelana,
 * sin gajos: la comida se sirve encima, como un plato de restaurante.
 */
const PLATE = { cx: 140, cy: 128, rx: 132, ry: 124 } as const
const WELL = { cx: 140, cy: 130, rx: 108, ry: 98 } as const

/**
 * Sitio de cada ración sobre el plato. Las cajas se solapan a propósito:
 * es un emplatado, no un collage.
 */
const FOOD_PLACE: Record<PlatoMarbellaSlot, { x: number; y: number; w: number; h: number }> = {
  entrante: { x: 28, y: 34, w: 132, h: 124 },
  principal: { x: 112, y: 26, w: 152, h: 140 },
  guarnicion: { x: 48, y: 116, w: 152, h: 122 },
}

const ZONE_LABEL_POS: Record<PlatoMarbellaSlot, { x: number; y: number }> = {
  entrante: { x: 86, y: 92 },
  principal: { x: 196, y: 92 },
  guarnicion: { x: 140, y: 178 },
}

/**
 * Pieza de dominio de la carta: un plato llano de porcelana. Cada elección
 * (entrant, principal, guarnició) se recorta del fondo de estudio y se sirve
 * sobre la vajilla, solapando las demás como un emplatado real.
 *
 * Uso:
 *   <PlateBuilder lang={lang} activeSlot={slot}>
 *     <PlateZone type="entrante" item={item} />
 *     <PlateZone type="principal" item={item} />
 *     <PlateZone type="guarnicion" item={item} />
 *   </PlateBuilder>
 */
export function PlateBuilder({
  lang,
  activeSlot = null,
  children,
  className,
}: {
  lang: CartaLang
  /** Zona en curso: solo refuerza la etiqueta vacía. */
  activeSlot?: PlatoMarbellaSlot | null
  children: ReactNode
  className?: string
}) {
  const uid = useId().replace(/:/g, '')
  const foodAnim = `pm-food-in-${uid}`
  const porcelainId = `pm-porcelain-${uid}`
  const floorId = `pm-floor-${uid}`
  const blurSoftId = `pm-blur-soft-${uid}`
  const blurStrongId = `pm-blur-strong-${uid}`
  const foodShadowId = `pm-food-shadow-${uid}`
  const wellClipId = `pm-well-clip-${uid}`

  const zones = new Map<PlatoMarbellaSlot, PlateZoneItem | null>()
  for (const s of SLOT_ORDER) zones.set(s, null)
  Children.forEach(children, (child) => {
    if (isValidElement(child) && child.type === PlateZone) {
      const { type, item } = child.props as {
        type: PlatoMarbellaSlot
        item: PlateZoneItem | null
      }
      if (type && SLOT_ORDER.includes(type)) zones.set(type, item)
    }
  })

  const slotLabels = platoMarbellaPlateSlotLabels(lang)
  const ariaParts = SLOT_ORDER.map((s) => {
    const it = zones.get(s)
    return it ? `${slotLabels[s]}: ${it.label}` : slotLabels[s]
  })
  const ariaLabel = ariaParts.join(', ')
  const hasFood = SLOT_ORDER.some((s) => zones.get(s)?.photoUrl)

  return (
    <div className={cn('w-full max-w-[20rem] sm:max-w-[22rem]', className)}>
      <style>{`
        @keyframes ${foodAnim} {
          from { opacity: 0; transform: translateY(8%) scale(0.92); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .${foodAnim} {
          animation: ${foodAnim} 280ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @media (prefers-reduced-motion: reduce) {
          .${foodAnim} {
            animation: none;
          }
        }
      `}</style>

      <svg
        viewBox="0 0 280 268"
        role="img"
        aria-label={ariaLabel}
        className="h-auto w-full"
      >
        <defs>
          <radialGradient id={porcelainId} cx="40%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="58%" stopColor="#fbfbfc" />
            <stop offset="82%" stopColor="#f1f2f4" />
            <stop offset="100%" stopColor="#e4e6ea" />
          </radialGradient>
          <radialGradient id={floorId} cx="48%" cy="36%" r="74%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#f7f7f8" />
            <stop offset="100%" stopColor="#eceef1" />
          </radialGradient>
          <filter id={blurSoftId} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
          <filter id={blurStrongId} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <filter id={foodShadowId} x="-35%" y="-25%" width="170%" height="180%">
            <feDropShadow dx="0" dy="4" stdDeviation="3.5" floodColor="#1a1a1a" floodOpacity="0.28" />
          </filter>
          <clipPath id={wellClipId}>
            <ellipse cx={WELL.cx} cy={WELL.cy} rx={WELL.rx} ry={WELL.ry} />
          </clipPath>
        </defs>

        <ellipse
          cx={PLATE.cx}
          cy={PLATE.cy + 10}
          rx={PLATE.rx + 4}
          ry={PLATE.ry + 4}
          fill="#0f172a"
          opacity="0.14"
          filter={`url(#${blurStrongId})`}
        />

        <ellipse
          cx={PLATE.cx}
          cy={PLATE.cy}
          rx={PLATE.rx}
          ry={PLATE.ry}
          fill={`url(#${porcelainId})`}
          stroke="#d5d7dc"
          strokeWidth="1"
        />
        <ellipse
          cx={PLATE.cx}
          cy={PLATE.cy}
          rx={PLATE.rx - 4}
          ry={PLATE.ry - 4}
          fill="none"
          stroke="rgba(255,255,255,0.7)"
          strokeWidth="1.25"
        />

        {/* Corona del reborde: el alimento vive en el hueco interior. */}
        <ellipse
          cx={WELL.cx}
          cy={WELL.cy}
          rx={WELL.rx + 6}
          ry={WELL.ry + 6}
          fill="none"
          stroke="rgba(15, 23, 42, 0.06)"
          strokeWidth="7"
        />
        <ellipse cx={WELL.cx} cy={WELL.cy} rx={WELL.rx} ry={WELL.ry} fill={`url(#${floorId})`} />
        <ellipse
          cx={WELL.cx}
          cy={WELL.cy}
          rx={WELL.rx}
          ry={WELL.ry}
          fill="none"
          stroke="#dddfe3"
          strokeWidth="1"
        />

        <g clipPath={`url(#${wellClipId})`}>
          {PAINT_ORDER.map((s) => {
            const item = zones.get(s)
            if (!item?.photoUrl) return null
            return (
              <PlateFoodLayer
                key={s}
                slot={s}
                item={item}
                foodAnim={foodAnim}
                foodShadowId={foodShadowId}
              />
            )
          })}
        </g>

        {SLOT_ORDER.map((s) => {
          if (zones.get(s)) return null
          const pos = ZONE_LABEL_POS[s]
          const active = activeSlot === s
          return (
            <text
              key={`label-${s}`}
              x={pos.x}
              y={pos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              pointerEvents="none"
              className={cn(
                'select-none font-sans text-[11px] font-semibold tracking-[0.06em] antialiased',
                active ? 'fill-zinc-500' : 'fill-zinc-400'
              )}
              style={{ opacity: hasFood ? (active ? 0.8 : 0.5) : active ? 0.95 : 0.7 }}
            >
              {slotLabels[s]}
            </text>
          )
        })}
      </svg>
    </div>
  )
}

function PlateFoodLayer({
  slot,
  item,
  foodAnim,
  foodShadowId,
}: {
  slot: PlatoMarbellaSlot
  item: PlateZoneItem
  foodAnim: string
  foodShadowId: string
}) {
  const cutout = useStudioCutout(item.photoUrl)
  const box = FOOD_PLACE[slot]
  if (!cutout) return null
  const cx = box.x + box.w / 2
  const isolated = cutout.isolated
  return (
    <g
      key={item.id ?? `${item.label}:${cutout.href}`}
      className={foodAnim}
      style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
    >
      <ellipse
        cx={cx}
        cy={box.y + box.h * 0.72}
        rx={box.w * 0.34}
        ry={box.h * 0.14}
        fill="#0f172a"
        opacity="0.16"
      />
      <g filter={isolated ? `url(#${foodShadowId})` : undefined}>
        <image
          href={cutout.href}
          x={box.x}
          y={box.y}
          width={box.w}
          height={box.h}
          preserveAspectRatio="xMidYMid meet"
          style={
            isolated
              ? undefined
              : { mixBlendMode: 'multiply', clipPath: 'ellipse(48% 46% at 50% 50%)' }
          }
        />
      </g>
    </g>
  )
}

/** Declara una zona del plato. No renderiza: PlateBuilder la posiciona. */
export function PlateZone(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _props: { type: PlatoMarbellaSlot; item: PlateZoneItem | null }
): null {
  return null
}
