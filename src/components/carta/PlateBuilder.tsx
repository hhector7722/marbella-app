'use client'

import { Children, isValidElement, useId, type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { CartaLang } from '@/lib/carta-menu-i18n'
import {
  platoMarbellaPlateSlotLabels,
  type PlatoMarbellaSlot,
} from '@/lib/carta-plato-marbella'
import { placePlateFoods } from '@/lib/carta-plate-composition'
import { useStudioCutout } from '@/components/carta/useStudioCutout'

/** Alimento colocado en el plato (null = tramo vacío). */
export type PlateZoneItem = {
  photoUrl: string | null
  label: string
  /** Clave de remontaje (p. ej. articulo_id) para repetir la animación de entrada. */
  id?: string
}

const SLOT_ORDER: PlatoMarbellaSlot[] = ['entrante', 'principal', 'guarnicion']

const ZONE_LABEL_POS: Record<PlatoMarbellaSlot, { left: string; top: string }> = {
  entrante: { left: '32%', top: '30%' },
  principal: { left: '72%', top: '36%' },
  guarnicion: { left: '48%', top: '72%' },
}

const PLATE_FACE: CSSProperties = {
  background:
    'radial-gradient(ellipse at 38% 28%, #ffffff 0%, #f6f4f1 48%, #efece7 78%, #e5e1db 100%)',
  boxShadow:
    '0 16px 32px rgba(28, 25, 23, 0.16), inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -10px 18px rgba(28, 25, 23, 0.05)',
}

const WELL_FACE: CSSProperties = {
  boxShadow: 'inset 0 1px 10px rgba(28, 25, 23, 0.06)',
}

/**
 * Pieza de dominio de la carta: un plato llano de porcelana.
 * Tres capas enteras sobre una sola vajilla, colocadas por tipo visual
 * (bol / principal / guarnición), no recortadas en gajos.
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

  const zones = new Map<PlatoMarbellaSlot, PlateZoneItem | null>()
  for (const s of SLOT_ORDER) zones.set(s, null)
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    const { type, item } = child.props as {
      type?: PlatoMarbellaSlot
      item?: PlateZoneItem | null
    }
    if (type && SLOT_ORDER.includes(type)) zones.set(type, item ?? null)
  })

  const slotLabels = platoMarbellaPlateSlotLabels(lang)
  const ariaParts = SLOT_ORDER.map((s) => {
    const it = zones.get(s)
    return it ? `${slotLabels[s]}: ${it.label}` : slotLabels[s]
  })
  const ariaLabel = ariaParts.join(', ')
  const hasFood = SLOT_ORDER.some((s) => zones.get(s)?.photoUrl)

  const layers = placePlateFoods(
    SLOT_ORDER.flatMap((slot) => {
      const item = zones.get(slot)
      if (!item?.photoUrl) return []
      return [{ slot, id: item.id, label: item.label }]
    }),
  )

  return (
    <div className={cn('relative mx-auto w-full max-w-[21rem] sm:max-w-[23rem]', className)}>
      <style>{`
        @keyframes ${foodAnim} {
          from { opacity: 0; transform: translateY(6%); }
          to { opacity: 1; transform: translateY(0); }
        }
        .${foodAnim} {
          animation: ${foodAnim} 320ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @media (prefers-reduced-motion: reduce) {
          .${foodAnim} {
            animation: none;
          }
        }
      `}</style>

      <div className="relative aspect-[1/0.94] w-full" role="img" aria-label={ariaLabel}>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-[10%] bottom-[1%] top-[22%] rounded-[50%] bg-stone-900/20 blur-xl"
        />

        <div className="absolute inset-[1.5%] rounded-[50%]" style={PLATE_FACE}>
          <div className="absolute inset-[10%] rounded-[50%]" style={WELL_FACE}>
            {layers.map((layer) => {
              const item = zones.get(layer.slot)
              if (!item?.photoUrl) return null
              return (
                <PlateFoodLayer
                  key={layer.slot}
                  item={item}
                  foodAnim={foodAnim}
                  left={layer.left}
                  top={layer.top}
                  width={layer.width}
                  height={layer.height}
                  z={layer.z}
                  scale={layer.scale}
                  nudgeX={layer.x}
                  nudgeY={layer.y}
                  rotate={layer.rotate}
                />
              )
            })}

            {SLOT_ORDER.map((s) => {
              if (zones.get(s)) return null
              const pos = ZONE_LABEL_POS[s]
              const active = activeSlot === s
              return (
                <span
                  key={`label-${s}`}
                  className={cn(
                    'pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 select-none font-sans text-[11px] font-semibold tracking-[0.06em] antialiased',
                    active ? 'text-zinc-500' : 'text-zinc-400'
                  )}
                  style={{
                    left: pos.left,
                    top: pos.top,
                    opacity: hasFood ? (active ? 0.8 : 0.45) : active ? 0.95 : 0.7,
                  }}
                >
                  {slotLabels[s]}
                </span>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function PlateFoodLayer({
  item,
  foodAnim,
  left,
  top,
  width,
  height,
  z,
  scale,
  nudgeX,
  nudgeY,
  rotate,
}: {
  item: PlateZoneItem
  foodAnim: string
  left: number
  top: number
  width: number
  height: number
  z: number
  scale: number
  nudgeX: number
  nudgeY: number
  rotate: number
}) {
  const cutout = useStudioCutout(item.photoUrl)
  if (!cutout) return null
  const isolated = cutout.isolated
  return (
    <span
      className={cn('absolute block', foodAnim)}
      style={{
        left: `${left}%`,
        top: `${top}%`,
        width: `${width}%`,
        height: `${height}%`,
        zIndex: z,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- recorte de foto de carta */}
      <img
        src={cutout.href}
        alt=""
        key={item.id ?? `${item.label}:${cutout.href}`}
        className="pointer-events-none h-full w-full origin-center object-contain object-center"
        style={{
          transform: `translate(${nudgeX}%, ${nudgeY}%) rotate(${rotate}deg) scale(${scale})`,
          filter: isolated
            ? 'drop-shadow(0 10px 12px rgba(28, 25, 23, 0.28)) drop-shadow(0 2px 3px rgba(28, 25, 23, 0.18))'
            : undefined,
          mixBlendMode: isolated ? undefined : 'multiply',
        }}
      />
    </span>
  )
}

/** Declara un alimento del plato. No renderiza: PlateBuilder lo coloca. */
export function PlateZone(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _props: { type: PlatoMarbellaSlot; item: PlateZoneItem | null }
): null {
  return null
}
