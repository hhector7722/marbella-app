'use client'

import Image from 'next/image'
import { Children, isValidElement, useId, type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { CartaLang } from '@/lib/carta-menu-i18n'
import {
  platoMarbellaPlateSlotLabels,
  type PlatoMarbellaSlot,
} from '@/lib/carta-plato-marbella'
import {
  PLATE_V15_BASE_PATH,
  PLATE_V15_BOWL_STARTERS,
  PLATE_V15_CANVAS,
  PLATE_V15_TRANSFORMS,
  plateV15AssetPath,
  plateV15HitBox,
  plateV15LabelPosition,
  resolvePlateV15Asset,
  type PlateV15AssetKey,
  type PlateV15Transform,
} from '@/lib/carta-plate-v15'
import { useStudioCutout } from '@/components/carta/useStudioCutout'

/** Alimento colocado en el plato (null = tramo vacío). */
export type PlateZoneItem = {
  photoUrl: string | null
  label: string
  /** Clave de remontaje (p. ej. articulo_id) para repetir la animación de entrada. */
  id?: string
}

const SLOT_ORDER: PlatoMarbellaSlot[] = ['entrante', 'principal', 'guarnicion']
const BASE_PLATE_SCALE = 0.93

const FALLBACK_BY_SLOT: Readonly<
  Record<PlatoMarbellaSlot, { left: number; top: number; width: number; height: number }>
> = {
  entrante: { left: 13, top: 22, width: 36, height: 34 },
  principal: { left: 50, top: 25, width: 34, height: 38 },
  guarnicion: { left: 31, top: 54, width: 32, height: 23 },
}

/**
 * Plate Builder V12.
 *
 * La vajilla y los alimentos reconocidos se renderizan desde los assets
 * canónicos de producción. Cada alimento conserva la misma transformación
 * independientemente de qué otros tramos estén seleccionados.
 */
export function PlateBuilder({
  lang,
  activeSlot = null,
  children,
  className,
}: {
  lang: CartaLang
  activeSlot?: PlatoMarbellaSlot | null
  children: ReactNode
  className?: string
}) {
  const uid = useId().replace(/:/g, '')
  const foodAnim = `pm-food-in-${uid}`

  type ZoneEntry = { item: PlateZoneItem | null; onSelect?: () => void }
  const zones = new Map<PlatoMarbellaSlot, ZoneEntry>()
  for (const s of SLOT_ORDER) zones.set(s, { item: null })
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    const { type, item, onSelect } = child.props as {
      type?: PlatoMarbellaSlot
      item?: PlateZoneItem | null
      onSelect?: () => void
    }
    if (type && SLOT_ORDER.includes(type)) zones.set(type, { item: item ?? null, onSelect })
  })

  const slotLabels = platoMarbellaPlateSlotLabels(lang)
  const hasFood = SLOT_ORDER.some((slot) => Boolean(zones.get(slot)?.item))

  return (
    <div className={cn('relative mx-auto w-full max-w-[21rem] sm:max-w-[23rem]', className)}>
      <style>{`
        @keyframes ${foodAnim} {
          from { opacity: 0; transform: translateY(2.5%); }
          to { opacity: 1; transform: translateY(0); }
        }
        .${foodAnim} {
          animation: ${foodAnim} 280ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @media (prefers-reduced-motion: reduce) {
          .${foodAnim} { animation: none; }
        }
      `}</style>

      <div className="relative aspect-[1609/1464] w-full select-none">
        <Image
          src={`${PLATE_V15_BASE_PATH}/base/plate.png`}
          alt=""
          fill
          priority
          unoptimized
          draggable={false}
          sizes="(max-width: 640px) 21rem, 23rem"
          className="pointer-events-none object-fill"
          style={{ transform: `scale(${BASE_PLATE_SCALE})`, transformOrigin: 'center center' }}
        />

        {SLOT_ORDER.map((slot) => {
          const zone = zones.get(slot)
          const item = zone?.item
          if (!item) return null
          const assetKey = resolvePlateV15Asset({ id: item.id, label: item.label, slot })
          return (
            <CanonicalSlotLayers
              key={`${slot}:${item.id ?? item.label}`}
              slot={slot}
              item={item}
              assetKey={assetKey}
              animationClass={foodAnim}
            />
          )
        })}

        {SLOT_ORDER.map((slot) => {
          const zone = zones.get(slot)
          const item = zone?.item
          const assetKey = item
            ? resolvePlateV15Asset({ id: item.id, label: item.label, slot })
            : null
          const active = activeSlot === slot
          const label = slotLabels[slot]

          if (item) {
            if (!zone?.onSelect) return null
            const box = plateV15HitBox(assetKey, slot)
            return (
              <button
                key={`hit-${slot}`}
                type="button"
                onClick={zone.onSelect}
                aria-label={`${label}: ${item.label}`}
                className="absolute z-30 rounded-2xl border-0 bg-transparent p-0 touch-manipulation outline-none transition-colors active:bg-black/[0.025] focus-visible:ring-2 focus-visible:ring-[#36606F]/35"
                style={{
                  left: `${box.left}%`,
                  top: `${box.top}%`,
                  width: `${box.width}%`,
                  height: `${box.height}%`,
                }}
              />
            )
          }

          const pos = plateV15LabelPosition(slot)
          const opacity = hasFood ? (active ? 0.82 : 0.46) : active ? 0.95 : 0.72
          const labelClass = cn(
            'select-none font-sans text-[11px] font-semibold tracking-[0.06em] antialiased',
            active ? 'text-zinc-500' : 'text-zinc-400'
          )

          if (!zone?.onSelect) {
            return (
              <span
                key={`label-${slot}`}
                className={cn(
                  'pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2',
                  labelClass
                )}
                style={{ left: `${pos.left}%`, top: `${pos.top}%`, opacity }}
              >
                {label}
              </span>
            )
          }

          return (
            <button
              key={`label-${slot}`}
              type="button"
              onClick={zone.onSelect}
              aria-label={label}
              className="absolute z-30 flex min-h-12 min-w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl border-0 bg-transparent p-1 touch-manipulation outline-none transition-colors active:bg-black/5 focus-visible:ring-2 focus-visible:ring-[#36606F]/30"
              style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
            >
              <span className={labelClass} style={{ opacity }}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function CanonicalSlotLayers({
  slot,
  item,
  assetKey,
  animationClass,
}: {
  slot: PlatoMarbellaSlot
  item: PlateZoneItem
  assetKey: PlateV15AssetKey | null
  animationClass: string
}) {
  if (!assetKey) {
    return <FallbackFoodLayer slot={slot} item={item} animationClass={animationClass} />
  }

  const transform = PLATE_V15_TRANSFORMS[assetKey]
  const isBowl = PLATE_V15_BOWL_STARTERS.has(assetKey)

  return (
    <span className={cn('pointer-events-none absolute inset-0 z-10', animationClass)}>
      {isBowl ? (
        <CanonicalImage
          src={`${PLATE_V15_BASE_PATH}/base/bowl_back.png`}
          transform={PLATE_V15_TRANSFORMS.bowl_group}
        />
      ) : null}
      <CanonicalImage src={plateV15AssetPath(assetKey)} transform={transform} />
      {isBowl ? (
        <CanonicalImage
          src={`${PLATE_V15_BASE_PATH}/base/bowl_front.png`}
          transform={PLATE_V15_TRANSFORMS.bowl_group}
        />
      ) : null}
    </span>
  )
}

function CanonicalImage({ src, transform }: { src: string; transform: PlateV15Transform }) {
  const left = (transform.x / PLATE_V15_CANVAS.width) * 100
  const top = (transform.y / PLATE_V15_CANVAS.height) * 100
  const style: CSSProperties = {
    left: `${left}%`,
    top: `${top}%`,
    transform: `scale(${transform.scale})`,
    transformOrigin: '0 0',
  }

  return (
    <span className="pointer-events-none absolute h-full w-full" style={style}>
      <Image
        src={src}
        alt=""
        fill
        unoptimized
        draggable={false}
        sizes="(max-width: 640px) 21rem, 23rem"
        className="object-fill"
      />
    </span>
  )
}

function FallbackFoodLayer({
  slot,
  item,
  animationClass,
}: {
  slot: PlatoMarbellaSlot
  item: PlateZoneItem
  animationClass: string
}) {
  const cutout = useStudioCutout(item.photoUrl)
  if (!cutout) return null
  const box = FALLBACK_BY_SLOT[slot]
  return (
    <span
      className={cn('pointer-events-none absolute z-10 block', animationClass)}
      style={{
        left: `${box.left}%`,
        top: `${box.top}%`,
        width: `${box.width}%`,
        height: `${box.height}%`,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- fallback de fotos no canónicas */}
      <img
        src={cutout.href}
        alt=""
        className="h-full w-full object-contain object-center"
        style={{
          filter: cutout.isolated
            ? 'drop-shadow(0 8px 10px rgba(28, 25, 23, 0.24)) drop-shadow(0 2px 3px rgba(28, 25, 23, 0.14))'
            : undefined,
          mixBlendMode: cutout.isolated ? undefined : 'multiply',
        }}
      />
    </span>
  )
}

/** Declara un alimento del plato. No renderiza: PlateBuilder lo coloca. */
export function PlateZone(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _props: { type: PlatoMarbellaSlot; item: PlateZoneItem | null; onSelect?: () => void }
): null {
  return null
}
