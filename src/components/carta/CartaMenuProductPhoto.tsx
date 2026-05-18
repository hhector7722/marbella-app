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
  className,
}: {
  src: string
  alt?: string
  scale?: CartaPhotoScale | string | null
  isDrink?: boolean
  className?: string
}) {
  const factor = getCartaProductPhotoScaleFactor(scale, isDrink)
  return (
    // eslint-disable-next-line @next/next/no-img-element -- URL Storage/receta
    <img
      src={src}
      alt={alt}
      className={cn(CARTA_PRODUCT_PHOTO_IMG_NEUTRAL_CLASS, className)}
      style={{ transform: `scale(${factor})` }}
    />
  )
}
