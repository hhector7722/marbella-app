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

/** Geometría del plato (viewBox 220×200): plato y hueco central elípticos. */
const PLATE = {
  cx: 110,
  cy: 100,
  rx: 104,
  ry: 96,
  edgeDy: 2,
  wellRx: 88,
  wellRy: 82,
  divY: 78,
} as const

const WELL = {
  x: PLATE.cx - PLATE.wellRx,
  y: PLATE.cy - PLATE.wellRy,
  w: PLATE.wellRx * 2,
  h: PLATE.wellRy * 2,
}

const ZONE_RECT: Record<PlatoMarbellaSlot, { x: number; y: number; w: number; h: number }> = {
  entrante: { x: WELL.x, y: WELL.y, w: WELL.w, h: PLATE.divY - WELL.y },
  principal: { x: WELL.x, y: PLATE.divY, w: PLATE.cx - WELL.x, h: WELL.y + WELL.h - PLATE.divY },
  guarnicion: { x: PLATE.cx, y: PLATE.divY, w: WELL.x + WELL.w - PLATE.cx, h: WELL.y + WELL.h - PLATE.divY },
}

const ZONE_LABEL_POS: Record<PlatoMarbellaSlot, { x: number; y: number }> = {
  entrante: { x: PLATE.cx, y: 54 },
  principal: { x: PLATE.cx - PLATE.wellRx / 2, y: 134 },
  guarnicion: { x: PLATE.cx + PLATE.wellRx / 2, y: 134 },
}

const PLATE_DIVIDER = '#E4E4E7'
const ACTIVE_ZONE_FILL = 'rgba(54, 96, 111, 0.05)'

/**
 * Pieza de dominio de la carta: un plato de porcelana realista dividido en tres
 * zonas (entrant arriba, principal abajo-izquierda, guarnició abajo-derecha)
 * que representa visualmente el estado del configurador Plat Marbella.
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
  /** Zona en curso: recibe un tinte de marca muy sutil. null = sin zona activa. */
  activeSlot?: PlatoMarbellaSlot | null
  children: ReactNode
  className?: string
}) {
  const uid = useId().replace(/:/g, '')
  const foodAnim = `pm-food-in-${uid}`
  const wellClipId = `pm-well-${uid}`
  const zoneClipId = (s: PlatoMarbellaSlot) => `pm-zone-${s}-${uid}`

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
    <div className={cn('w-full max-w-[15rem] sm:max-w-[17rem]', className)}>
      <style>{`
        @keyframes ${foodAnim} {
          from { opacity: 0; transform: translateY(6px) scale(0.94); }
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
        viewBox="0 0 220 200"
        role="img"
        aria-label={ariaLabel}
        className="h-auto w-full drop-shadow-sm"
      >
        <defs>
          <linearGradient id={`pm-porcelain-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#fdfdff" />
            <stop offset="100%" stopColor="#edeef1" />
          </linearGradient>
          <radialGradient id={`pm-well-${uid}`} cx="50%" cy="40%" r="72%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="70%" stopColor="#fafafc" />
            <stop offset="100%" stopColor="#e7e8eb" />
          </radialGradient>
          <clipPath id={wellClipId}>
            <ellipse cx={PLATE.cx} cy={PLATE.cy} rx={PLATE.wellRx} ry={PLATE.wellRy} />
          </clipPath>
          {SLOT_ORDER.map((s) => (
            <clipPath key={s} id={zoneClipId(s)}>
              <rect
                x={ZONE_RECT[s].x}
                y={ZONE_RECT[s].y}
                width={ZONE_RECT[s].w}
                height={ZONE_RECT[s].h}
              />
            </clipPath>
          ))}
        </defs>

        {/* Canto inferior del plato (grosor mínimo, da sensación de perspectiva). */}
        <ellipse
          cx={PLATE.cx}
          cy={PLATE.cy + PLATE.edgeDy}
          rx={PLATE.rx}
          ry={PLATE.ry}
          fill="#e3e4e8"
        />
        {/* Cuerpo del plato. */}
        <ellipse
          cx={PLATE.cx}
          cy={PLATE.cy}
          rx={PLATE.rx}
          ry={PLATE.ry}
          fill={`url(#pm-porcelain-${uid})`}
          stroke={PLATE_DIVIDER}
          strokeWidth="1.5"
        />
        {/* Hilo interior del borde. */}
        <ellipse
          cx={PLATE.cx}
          cy={PLATE.cy}
          rx={PLATE.rx - 6}
          ry={PLATE.ry - 6}
          fill="none"
          stroke="#f1f1f3"
          strokeWidth="1"
        />
        {/* Hueco central donde se coloca la comida. */}
        <ellipse
          cx={PLATE.cx}
          cy={PLATE.cy}
          rx={PLATE.wellRx}
          ry={PLATE.wellRy}
          fill={`url(#pm-well-${uid})`}
        />
        <ellipse
          cx={PLATE.cx}
          cy={PLATE.cy}
          rx={PLATE.wellRx}
          ry={PLATE.wellRy}
          fill="none"
          stroke="rgba(24, 24, 27, 0.05)"
          strokeWidth="3"
        />

        {/* Zonas, divisores y alimentos, recortados al hueco del plato. */}
        <g clipPath={`url(#${wellClipId})`}>
          {activeSlot ? (
            <g clipPath={`url(#${zoneClipId(activeSlot)})`}>
              <rect x={WELL.x} y={WELL.y} width={WELL.w} height={WELL.h} fill={ACTIVE_ZONE_FILL} />
            </g>
          ) : null}
          <line
            x1={WELL.x}
            y1={PLATE.divY}
            x2={WELL.x + WELL.w}
            y2={PLATE.divY}
            stroke={PLATE_DIVIDER}
            strokeWidth="1.25"
            pointerEvents="none"
          />
          <line
            x1={PLATE.cx}
            y1={PLATE.divY}
            x2={PLATE.cx}
            y2={WELL.y + WELL.h}
            stroke={PLATE_DIVIDER}
            strokeWidth="1.25"
            pointerEvents="none"
          />

          {SLOT_ORDER.map((s) => {
            const item = zones.get(s)
            if (!item?.photoUrl) return null
            const r = ZONE_RECT[s]
            return (
              <g key={s} clipPath={`url(#${zoneClipId(s)})`}>
                <foreignObject x={r.x} y={r.y} width={r.w} height={r.h}>
                  <div
                    key={item.id ?? `${item.label}:${item.photoUrl}`}
                    className={cn(foodAnim, 'h-full w-full overflow-hidden')}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL Storage/receta */}
                    <img
                      src={item.photoUrl}
                      alt={item.label}
                      loading="eager"
                      decoding="async"
                      className="pointer-events-none h-full w-full object-contain drop-shadow-[0_2px_3px_rgba(24,24,27,0.18)]"
                    />
                  </div>
                </foreignObject>
              </g>
            )
          })}
        </g>

        {/* Etiquetas de zona vacía (discretas y elegantes). */}
        {SLOT_ORDER.map((s) =>
          zones.get(s) ? null : (
            <text
              key={`label-${s}`}
              x={ZONE_LABEL_POS[s].x}
              y={ZONE_LABEL_POS[s].y}
              textAnchor="middle"
              dominantBaseline="middle"
              pointerEvents="none"
              className="select-none fill-zinc-400 font-sans text-[11px] font-semibold tracking-[0.05em] antialiased"
            >
              {slotLabels[s]}
            </text>
          )
        )}
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