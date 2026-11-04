'use client'

import {
  getCartaProductPhotoScaleFactor,
  CARTA_PRODUCT_PHOTO_IMG_NEUTRAL_CLASS,
  type CartaPhotoScale,
} from '@/lib/carta-product-photo'
import { cn } from '@/lib/utils'

export function CartaMenuProductPhoto({
  src,
  alt = '',
  scale,
  isDrink = false,
  articuloId,
  className,
  squareLayout = false,
}: {
  src: string
  alt?: string
  scale?: CartaPhotoScale | string | null
  isDrink?: boolean
  /** Si hay override en `carta-product-photo`, prevalece sobre S/M/L. */
  articuloId?: number | null
  className?: string
  squareLayout?: boolean
}) {
  const factor = getCartaProductPhotoScaleFactor(scale, isDrink, articuloId)
  // El marco cuadrado es menos alto que el original: compensar el margen blanco.
  const displayedFactor = squareLayout
    ? isDrink ? Math.min(1.48, factor * 1.88) : Math.min(1.85, factor * 2.15)
    : factor

  return (
    // eslint-disable-next-line @next/next/no-img-element -- URL Storage/receta
    <img
      src={src}
      alt={alt}
      loading="eager"
      decoding="async"
      className={cn(CARTA_PRODUCT_PHOTO_IMG_NEUTRAL_CLASS, className)}
      style={{ transform: `scale(${displayedFactor})` }}
    />
  )
}
