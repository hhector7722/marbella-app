'use client'

import { useCartaCoversLoadContext } from '@/components/carta/CartaCoversLoadingGate'
import { useCallback, useLayoutEffect, useRef } from 'react'

export function useCartaImageLoadReport(src: string) {
  const loadCtx = useCartaCoversLoadContext()
  const imgRef = useRef<HTMLImageElement>(null)

  const notifyLoaded = useCallback(() => {
    loadCtx?.reportLoaded(src)
  }, [loadCtx, src])

  useLayoutEffect(() => {
    const el = imgRef.current
    if (!loadCtx || !el?.complete) return
    notifyLoaded()
  }, [src, loadCtx, notifyLoaded])

  return { imgRef, notifyLoaded }
}
