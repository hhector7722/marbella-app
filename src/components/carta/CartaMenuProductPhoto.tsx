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
  premiumPublic = false,
}: {
  src: string
  alt?: string
  scale?: CartaPhotoScale | string | null
  isDrink?: boolean
  /** Si hay override en `carta-product-photo`, prevalece sobre S/M/L. */
  articuloId?: number | null
  className?: string
  premiumPublic?: boolean
}) {
  const factor = getCartaProductPhotoScaleFactor(scale, isDrink, articuloId)
  const displayedFactor = premiumPublic ? factor * 2.0 : factor

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
