'use client'

import {
  getCartaCoverPhotoScaleFactor,
  type CartaPhotoScale,
} from '@/lib/carta-product-photo'
import { cn } from '@/lib/utils'
import { useState } from 'react'

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
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  return (
    <span className="relative block h-full w-full overflow-hidden">
      <span
        aria-hidden
        className={cn(
          'absolute inset-0 rounded-lg bg-zinc-100/90',
          !loaded && !failed && 'animate-pulse',
          failed && 'bg-zinc-100'
        )}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- URL Storage/receta */}
      <img
        src={src}
        alt={alt}
        loading="eager"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={cn(
          'relative h-full w-full origin-center object-contain object-center transition-opacity duration-200',
          loaded && !failed ? 'opacity-100' : 'opacity-0',
          className
        )}
        style={{ transform: `scale(${factor})` }}
      />
    </span>
  )
}
