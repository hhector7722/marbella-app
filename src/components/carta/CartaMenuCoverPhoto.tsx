'use client'

import {
  getCartaCoverPhotoScaleFactor,
  type CartaPhotoScale,
} from '@/lib/carta-product-photo'
import { cn } from '@/lib/utils'

export function CartaMenuCoverPhoto({
  src,
  alt = '',
  scale,
  className,
}: {
  src: string
  alt?: string
  scale?: CartaPhotoScale | string | null
  className?: string
}) {
  const factor = getCartaCoverPhotoScaleFactor(scale)
  return (
    // eslint-disable-next-line @next/next/no-img-element -- URL Storage/receta
    <img
      src={src}
      alt={alt}
      className={cn('h-full w-full origin-center object-contain object-center', className)}
      style={{ transform: `scale(${factor})` }}
    />
  )
}
