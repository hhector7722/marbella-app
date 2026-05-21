'use client'

import {
  getCartaCoverPhotoScaleFactor,
  type CartaPhotoScale,
} from '@/lib/carta-product-photo'
import { cn } from '@/lib/utils'
import { useCartaImageLoadReport } from '@/components/carta/useCartaImageLoadReport'

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
  const { imgRef, notifyLoaded } = useCartaImageLoadReport(src)

  return (
    <span className="relative block h-full w-full bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element -- URL Storage/receta */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading="eager"
        decoding="async"
        onLoad={notifyLoaded}
        onError={notifyLoaded}
        className={cn(
          'relative h-full w-full origin-center object-contain object-center',
          className
        )}
        style={{ transform: `scale(${factor})` }}
      />
    </span>
  )
}
