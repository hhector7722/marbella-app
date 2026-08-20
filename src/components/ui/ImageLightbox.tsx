'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { PinchZoomViewport } from '@/components/ui/PinchZoomViewport'
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking'

export type ImageLightboxSlide = {
  src: string
  alt: string
}

type ImageLightboxProps = {
  open: boolean
  onClose: () => void
  className?: string
  /** Modo simple: una sola imagen */
  src?: string | null
  alt?: string
  /** Carrusel: varias imágenes (deslizar o flechas) */
  slides?: ImageLightboxSlide[]
  activeIndex?: number
  onActiveIndexChange?: (index: number) => void
}

const SWIPE_THRESHOLD_PX = 48

export function ImageLightbox({
  open,
  onClose,
  className,
  src,
  alt,
  slides,
  activeIndex = 0,
  onActiveIndexChange,
}: ImageLightboxProps) {
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const [internalIndex, setInternalIndex] = useState(activeIndex)

  const resolvedSlides: ImageLightboxSlide[] =
    slides && slides.length > 0
      ? slides
      : src
        ? [{ src, alt: alt ?? '' }]
        : []

  const slideCount = resolvedSlides.length
  const isControlled = onActiveIndexChange != null
  const currentIndex = isControlled
    ? Math.min(Math.max(activeIndex, 0), Math.max(slideCount - 1, 0))
    : internalIndex

  const currentSlide = resolvedSlides[currentIndex]

  useModalUsageTracking({
    open,
    usageId: 'image-lightbox',
    usageLabel: 'Imagen ampliada',
    disabled: !currentSlide,
  })

  useEffect(() => {
    if (!isControlled) setInternalIndex(activeIndex)
  }, [activeIndex, isControlled, open])

  const setIndex = useCallback(
    (next: number) => {
      if (slideCount <= 0) return
      const clamped = Math.min(Math.max(next, 0), slideCount - 1)
      if (isControlled) onActiveIndexChange?.(clamped)
      else setInternalIndex(clamped)
    },
    [isControlled, onActiveIndexChange, slideCount],
  )

  const goPrev = useCallback(() => {
    if (currentIndex > 0) setIndex(currentIndex - 1)
  }, [currentIndex, setIndex])

  const goNext = useCallback(() => {
    if (currentIndex < slideCount - 1) setIndex(currentIndex + 1)
  }, [currentIndex, setIndex, slideCount])

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1 || slideCount <= 1) return
    swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!swipeStart.current || slideCount <= 1) return
    const touch = e.changedTouches[0]
    const dx = touch.clientX - swipeStart.current.x
    const dy = touch.clientY - swipeStart.current.y
    swipeStart.current = null
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy)) return
    if (dx < 0) goNext()
    else goPrev()
  }

  if (!open || !currentSlide) return null

  const canPrev = slideCount > 1 && currentIndex > 0
  const canNext = slideCount > 1 && currentIndex < slideCount - 1

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Imagen ampliada"
      className={cn(
        'fixed inset-0 z-[300] flex flex-col bg-black/80 backdrop-blur-sm',
        'pt-[max(8px,env(safe-area-inset-top))]',
        className,
      )}
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="flex min-h-0 flex-1 flex-col px-3 pb-2 pt-1 sm:px-5"
        onClick={(e) => e.stopPropagation()}
      >
        {slideCount > 1 ? (
          <p className="mb-2 shrink-0 text-center text-[10px] font-black uppercase tracking-widest text-white/80">
            {currentSlide.alt}
            <span className="ml-2 tabular-nums text-white/50">
              {currentIndex + 1}/{slideCount}
            </span>
          </p>
        ) : currentSlide.alt ? (
          <p className="mb-2 shrink-0 text-center text-[10px] font-black uppercase tracking-widest text-white/80">
            {currentSlide.alt}
          </p>
        ) : null}

        <div className="relative flex min-h-0 flex-1 items-stretch">
          {canPrev ? (
            <button
              type="button"
              onClick={goPrev}
              className="absolute left-0 top-1/2 z-10 flex h-12 w-12 min-h-[48px] min-w-[48px] -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white transition hover:bg-black/60 active:scale-95"
              aria-label="Imagen anterior"
            >
              <ChevronLeft size={24} strokeWidth={2.5} />
            </button>
          ) : null}

          <PinchZoomViewport
            resetKey={currentSlide.src}
            className="flex-1 rounded-2xl border border-white/10 bg-black/40 shadow-2xl"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentSlide.src}
              alt={currentSlide.alt}
              className="max-h-[min(72dvh,calc(100svh-11rem))] w-auto max-w-full object-contain sm:max-h-[min(78vh,calc(100vh-11rem))]"
              draggable={false}
            />
          </PinchZoomViewport>

          {canNext ? (
            <button
              type="button"
              onClick={goNext}
              className="absolute right-0 top-1/2 z-10 flex h-12 w-12 min-h-[48px] min-w-[48px] -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white transition hover:bg-black/60 active:scale-95"
              aria-label="Imagen siguiente"
            >
              <ChevronRight size={24} strokeWidth={2.5} />
            </button>
          ) : null}
        </div>

        <div className="mt-2 flex shrink-0 justify-center pb-[max(10px,env(safe-area-inset-bottom))] pt-1 sm:mt-3">
          <Button
            type="button"
            variant="secondary"
            instance="image-lightbox-cerrar"
            onClick={onClose}
            aria-label="Cerrar imagen"
            className="shrink-0"
          >
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  )
}
