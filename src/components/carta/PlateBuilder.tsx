'use client'

import { Children, isValidElement, useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { CartaLang } from '@/lib/carta-menu-i18n'
import {
  platoMarbellaPlateSlotLabels,
  type PlatoMarbellaSlot,
} from '@/lib/carta-plato-marbella'

/** Alimento colocado en una zona del plato (null = zona vacía). */
export type PlateZoneItem = {
  photoUrl: string | null
  label: string
  /** Clave de remontaje (p. ej. articulo_id) para repetir la animación de entrada. */
  id?: string
}

const SLOT_ORDER: PlatoMarbellaSlot[] = ['entrante', 'principal', 'guarnicion']

/**
 * Geometría del plato (viewBox 240×232). Un plato real visto ligeramente
 * desde arriba: el reborde es un anillo coplanar y el fondo del hueco está
 * desplazado hacia el observador (perspectiva).
 */
const PLATE = { cx: 120, cy: 112, rx: 116, ry: 106 } as const
/** Borde interior del reborde: coplanar con el plato. */
const WELL = { cx: 120, cy: 112, rx: 100, ry: 90 } as const
/** Fondo del hueco: más bajo y ligeramente más pequeño, desplazado hacia abajo. */
const FLOOR = { cx: 120, cy: 116, rx: 90, ry: 80, divY: 92 } as const

const floorBottom = FLOOR.cy + FLOOR.ry

function floorXHalfAtY(y: number): number {
  const t = (y - FLOOR.cy) / FLOOR.ry
  return FLOOR.rx * Math.sqrt(Math.max(0, 1 - t * t))
}

const leftDiv = FLOOR.cx - floorXHalfAtY(FLOOR.divY)
const rightDiv = FLOOR.cx + floorXHalfAtY(FLOOR.divY)

/**
 * Recortes de cada tramo: siguen la elipse real del fondo (arco + divisor),
 * nunca cajas rectangulares. La separación es la pared moldeada del plato.
 */
const COMPARTMENT_PATH: Record<PlatoMarbellaSlot, string> = {
  entrante: `M ${leftDiv} ${FLOOR.divY} A ${FLOOR.rx} ${FLOOR.ry} 0 0 1 ${rightDiv} ${FLOOR.divY} L ${leftDiv} ${FLOOR.divY} Z`,
  principal: `M ${leftDiv} ${FLOOR.divY} A ${FLOOR.rx} ${FLOOR.ry} 0 0 0 ${FLOOR.cx} ${floorBottom} L ${FLOOR.cx} ${FLOOR.divY} L ${leftDiv} ${FLOOR.divY} Z`,
  guarnicion: `M ${rightDiv} ${FLOOR.divY} A ${FLOOR.rx} ${FLOOR.ry} 0 0 1 ${FLOOR.cx} ${floorBottom} L ${FLOOR.cx} ${FLOOR.divY} L ${rightDiv} ${FLOOR.divY} Z`,
}

/** Caja donde se sirve cada alimento dentro de su tramo (posición y escala propias). */
const FOOD_SLOT: Record<PlatoMarbellaSlot, { x: number; y: number; w: number; h: number }> = {
  entrante: { x: FLOOR.cx - 48, y: FLOOR.cy - FLOOR.ry + 2, w: 96, h: 46 },
  principal: { x: FLOOR.cx - FLOOR.rx + 9, y: FLOOR.divY + 11, w: 68, h: 82 },
  guarnicion: { x: FLOOR.cx + 13, y: FLOOR.divY + 14, w: 68, h: 76 },
}

const ZONE_LABEL_POS: Record<PlatoMarbellaSlot, { x: number; y: number }> = {
  entrante: { x: FLOOR.cx, y: 62 },
  principal: { x: FLOOR.cx - FLOOR.rx / 2, y: 144 },
  guarnicion: { x: FLOOR.cx + FLOOR.rx / 2, y: 144 },
}

const CAST_SHADOW = 'rgba(15, 23, 42, 0.18)'
const RIDGE_HIGHLIGHT_H = 'rgba(255, 255, 255, 0.85)'
const RIDGE_HIGHLIGHT_V = 'rgba(255, 255, 255, 0.7)'

/**
 * Pieza de dominio de la carta: un plato de porcelana realista visto
 * ligeramente desde arriba, con tres compartimentos moldeados (entrant,
 * principal, guarnició) que representan el estado del configurador Plat
 * Marbella. La comida se integra como capas dinámicas sobre la porcelana.
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
  /** Zona en curso: solo refuerza la etiqueta vacía. No pinta cajas. */
  activeSlot?: PlatoMarbellaSlot | null
  children: ReactNode
  className?: string
}) {
  const uid = useId().replace(/:/g, '')
  const foodAnim = `pm-food-in-${uid}`
  const porcelainId = `pm-porcelain-${uid}`
  const wallId = `pm-wall-${uid}`
  const floorId = `pm-floor-${uid}`
  const blurSoftId = `pm-blur-soft-${uid}`
  const blurStrongId = `pm-blur-strong-${uid}`
  const floorClipId = `pm-floor-clip-${uid}`
  const compartmentClipId = (s: PlatoMarbellaSlot) => `pm-comp-${s}-${uid}`

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

  return (
    <div className={cn('w-full max-w-[18rem] sm:max-w-[19.5rem]', className)}>
      <style>{`
        @keyframes ${foodAnim} {
          from { opacity: 0; transform: translateY(10%) scale(0.9); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .${foodAnim} {
          animation: ${foodAnim} 200ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @media (prefers-reduced-motion: reduce) {
          .${foodAnim} {
            animation: none;
          }
        }
      `}</style>

      <svg
        viewBox="0 0 240 232"
        role="img"
        aria-label={ariaLabel}
        className="h-auto w-full"
      >
        <defs>
          <radialGradient id={porcelainId} cx="42%" cy="32%" r="72%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#fbfbfd" />
            <stop offset="85%" stopColor="#f0f1f4" />
            <stop offset="100%" stopColor="#e3e5ea" />
          </radialGradient>
          <linearGradient id={wallId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#cfd2d8" />
            <stop offset="100%" stopColor="#edf0f2" />
          </linearGradient>
          <radialGradient id={floorId} cx="50%" cy="38%" r="78%">
            <stop offset="0%" stopColor="#fdfdff" />
            <stop offset="62%" stopColor="#f5f6f8" />
            <stop offset="88%" stopColor="#eceef1" />
            <stop offset="100%" stopColor="#e1e4e8" />
          </radialGradient>
          <filter id={blurSoftId} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
          <filter id={blurStrongId} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <clipPath id={floorClipId}>
            <ellipse cx={FLOOR.cx} cy={FLOOR.cy} rx={FLOOR.rx} ry={FLOOR.ry} />
          </clipPath>
          {SLOT_ORDER.map((s) => (
            <clipPath key={s} id={compartmentClipId(s)}>
              <path d={COMPARTMENT_PATH[s]} />
            </clipPath>
          ))}
        </defs>

        {/* Sombra que apoya el plato sobre la mesa. */}
        <ellipse
          cx={PLATE.cx}
          cy={PLATE.cy + 8}
          rx={PLATE.rx + 5}
          ry={PLATE.ry + 5}
          fill="#0f172a"
          opacity="0.12"
          filter={`url(#${blurStrongId})`}
        />

        {/* Cuerpo de porcelana. */}
        <ellipse
          cx={PLATE.cx}
          cy={PLATE.cy}
          rx={PLATE.rx}
          ry={PLATE.ry}
          fill={`url(#${porcelainId})`}
          stroke="#d7dade"
          strokeWidth="1"
        />
        {/* Hilo de brillo del reborde. */}
        <ellipse
          cx={PLATE.cx}
          cy={PLATE.cy}
          rx={PLATE.rx - 3}
          ry={PLATE.ry - 3}
          fill="none"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="1"
          opacity="0.5"
        />

        {/* Pared interior del hueco (la corona que queda visible tras el fondo). */}
        <ellipse cx={WELL.cx} cy={WELL.cy} rx={WELL.rx} ry={WELL.ry} fill={`url(#${wallId})`} />
        {/* Fondo del hueco donde se sirve la comida. */}
        <ellipse cx={FLOOR.cx} cy={FLOOR.cy} rx={FLOOR.rx} ry={FLOOR.ry} fill={`url(#${floorId})`} />

        {/* Profundidad: sombra blanda junto al borde del fondo + filo nítido. */}
        <g clipPath={`url(#${floorClipId})`}>
          <ellipse
            cx={FLOOR.cx}
            cy={FLOOR.cy}
            rx={FLOOR.rx}
            ry={FLOOR.ry}
            fill="none"
            stroke="rgba(15, 23, 42, 0.10)"
            strokeWidth="5"
            filter={`url(#${blurSoftId})`}
          />
          <ellipse
            cx={FLOOR.cx}
            cy={FLOOR.cy}
            rx={FLOOR.rx}
            ry={FLOOR.ry}
            fill="none"
            stroke="#d3d6dc"
            strokeWidth="1"
          />
        </g>

        {/* Comida: capas dinámicas integradas en la porcelana. */}
        {SLOT_ORDER.map((s) => {
          const item = zones.get(s)
          if (!item?.photoUrl) return null
          const slot = FOOD_SLOT[s]
          return (
            <g key={s} clipPath={`url(#${compartmentClipId(s)})`}>
              {/* Sombra de contacto muy sutil bajo el alimento. */}
              <ellipse
                cx={slot.x + slot.w / 2}
                cy={slot.y + slot.h * 0.82}
                rx={slot.w * 0.28}
                ry={slot.h * 0.1}
                fill="#0f172a"
                opacity="0.07"
                filter={`url(#${blurSoftId})`}
              />
              <g
                key={item.id ?? `${item.label}:${item.photoUrl}`}
                className={foodAnim}
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
              >
                <image
                  href={item.photoUrl}
                  x={slot.x}
                  y={slot.y}
                  width={slot.w}
                  height={slot.h}
                  preserveAspectRatio="xMidYMid meet"
                  style={{ mixBlendMode: 'multiply' }}
                />
              </g>
            </g>
          )
        })}

        {/* Separadores moldeados entre tramos (relieve con luz y sombra proyectada). */}
        <g clipPath={`url(#${floorClipId})`}>
          {/* Horizontal: entrant / inferiores (sombra proyectada bajo el relieve). */}
          <rect
            x={FLOOR.cx - FLOOR.rx - 2}
            y={FLOOR.divY + 1.2}
            width={FLOOR.rx * 2 + 4}
            height={5.5}
            fill={CAST_SHADOW}
            filter={`url(#${blurSoftId})`}
          />
          <rect
            x={FLOOR.cx - FLOOR.rx - 2}
            y={FLOOR.divY - 1.6}
            width={FLOOR.rx * 2 + 4}
            height={2.8}
            fill={RIDGE_HIGHLIGHT_H}
          />
          {/* Vertical: principal / guarnició. */}
          <rect
            x={FLOOR.cx + 1.3}
            y={FLOOR.divY}
            width={5}
            height={floorBottom - FLOOR.divY}
            fill={CAST_SHADOW}
            filter={`url(#${blurSoftId})`}
          />
          <rect
            x={FLOOR.cx - 1.4}
            y={FLOOR.divY}
            width={2.8}
            height={floorBottom - FLOOR.divY}
            fill={RIDGE_HIGHLIGHT_V}
          />
        </g>

        {/* Etiquetas de tramo vacío (muy discretas). */}
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
                'select-none font-sans text-[10px] font-semibold tracking-[0.06em] antialiased',
                active ? 'fill-zinc-500' : 'fill-zinc-400'
              )}
              style={{ opacity: active ? 0.9 : 0.75 }}
            >
              {slotLabels[s]}
            </text>
          )
        })}
      </svg>
    </div>
  )
}

/** Declara una zona del plato. No renderiza: PlateBuilder la posiciona. */
export function PlateZone(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _props: { type: PlatoMarbellaSlot; item: PlateZoneItem | null }
): null {
  return null
}