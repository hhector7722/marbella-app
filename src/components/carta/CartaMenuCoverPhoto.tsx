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
    <span className="relative block h-full w-full bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element -- URL Storage/receta */}
      <img
        src={src}
        alt={alt}
        loading="eager"
        decoding="async"
        className={cn(
          'relative h-full w-full origin-center object-contain object-center',
          className
        )}
        style={{ transform: `scale(${factor})` }}
      />
    </span>
  )
}
