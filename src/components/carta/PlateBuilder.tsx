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
 * Si `PlateZone` recibe `onSelect`, la zona (la etiqueta vacía o la foto
 * colocada) se vuelve pulsable; sin él, el plato es solo lectura.
 *
 * Uso:
 *   <PlateBuilder lang={lang} activeSlot={slot}>
 *     <PlateZone type="entrante" item={item} onSelect={() => open('entrante')} />
 *     <PlateZone type="principal" item={item} onSelect={() => open('principal')} />
 *     <PlateZone type="guarnicion" item={item} onSelect={() => open('guarnicion')} />
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
  const hasFood = SLOT_ORDER.some((s) => zones.get(s)?.item?.photoUrl)

  const layers = placePlateFoods(
    SLOT_ORDER.flatMap((slot) => {
      const item = zones.get(slot)?.item
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

      <div className="relative aspect-[1/0.94] w-full">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-[10%] bottom-[1%] top-[22%] rounded-[50%] bg-stone-900/20 blur-xl"
        />

        <div className="absolute inset-[1.5%] rounded-[50%]" style={PLATE_FACE}>
          <div className="absolute inset-[10%] rounded-[50%]" style={WELL_FACE}>
            {layers.map((layer) => {
              const zone = zones.get(layer.slot)
              const item = zone?.item
              if (!item?.photoUrl) return null
              return (
                <PlateFoodLayer
                  key={layer.slot}
                  item={item}
                  foodAnim={foodAnim}
                  onSelect={zone?.onSelect}
                  ariaLabel={`${slotLabels[layer.slot]}: ${item.label}`}
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
              const zone = zones.get(s)
              if (zone?.item) return null
              const pos = ZONE_LABEL_POS[s]
              const active = activeSlot === s
              const label = slotLabels[s]
              const opacity = hasFood ? (active ? 0.8 : 0.45) : active ? 0.95 : 0.7
              const labelClass = cn(
                'select-none font-sans text-[11px] font-semibold tracking-[0.06em] antialiased',
                active ? 'text-zinc-500' : 'text-zinc-400'
              )
              if (!zone?.onSelect) {
                return (
                  <span
                    key={`label-${s}`}
                    className={cn(
                      'pointer-events-none absolute -translate-x-1/2 -translate-y-1/2',
                      labelClass
                    )}
                    style={{ left: pos.left, top: pos.top, opacity }}
                  >
                    {label}
                  </span>
                )
              }
              return (
                <button
                  key={`label-${s}`}
                  type="button"
                  onClick={zone.onSelect}
                  aria-label={label}
                  className="absolute flex min-h-12 min-w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl border-0 bg-transparent p-1 touch-manipulation outline-none transition-colors active:bg-black/5 focus-visible:ring-2 focus-visible:ring-[#36606F]/30"
                  style={{ left: pos.left, top: pos.top }}
                >
                  <span className={labelClass} style={{ opacity }}>
                    {label}
                  </span>
                </button>
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
  onSelect,
  ariaLabel,
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
  onSelect?: () => void
  ariaLabel: string
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
  const style = {
    left: `${left}%`,
    top: `${top}%`,
    width: `${width}%`,
    height: `${height}%`,
    zIndex: z,
  }
  const photo = (
    // eslint-disable-next-line @next/next/no-img-element -- recorte de foto de carta
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
  )
  if (!onSelect) {
    return (
      <span className={cn('absolute block', foodAnim)} style={style}>
        {photo}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={ariaLabel}
      className={cn(
        'absolute block cursor-pointer border-0 bg-transparent p-0 touch-manipulation outline-none transition-opacity active:opacity-80 focus-visible:ring-2 focus-visible:ring-[#36606F]/30',
        foodAnim
      )}
      style={style}
    >
      {photo}
    </button>
  )
}

/** Declara un alimento del plato. No renderiza: PlateBuilder lo coloca. */
export function PlateZone(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _props: { type: PlatoMarbellaSlot; item: PlateZoneItem | null; onSelect?: () => void }
): null {
  return null
}
