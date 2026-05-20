'use client'

import {
  getCartaCoverPhotoScaleFactor,
  type CartaPhotoScale,
} from '@/lib/carta-product-photo'
import { cn } from '@/lib/utils'
import { useCartaCoversLoadContext } from '@/components/carta/CartaCoversLoadingGate'
import { useCallback, useLayoutEffect, useRef } from 'react'

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
  const loadCtx = useCartaCoversLoadContext()
  const imgRef = useRef<HTMLImageElement>(null)

  const notifyLoaded = useCallback(() => {
    loadCtx?.reportLoaded(src)
  }, [loadCtx, src])

  useLayoutEffect(() => {
    const el = imgRef.current
    if (!loadCtx || !el) return
    if (el.complete) notifyLoaded()
  }, [src, loadCtx, notifyLoaded])

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
