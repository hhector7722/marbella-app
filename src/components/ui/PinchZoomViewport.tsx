'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type TouchEvent,
} from 'react'
import { cn } from '@/lib/utils'

const DEFAULT_MIN_SCALE = 0.2
const DEFAULT_MAX_SCALE = 4
const DEFAULT_INITIAL_SCALE = 1

function touchDistance(touches: TouchEvent['touches']) {
  if (touches.length < 2) return 0
  const a = touches.item(0)
  const b = touches.item(1)
  if (!a || !b) return 0
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}

function touchMidpoint(touches: TouchEvent['touches']) {
  if (touches.length < 2) return { x: 0, y: 0 }
  const a = touches.item(0)
  const b = touches.item(1)
  if (!a || !b) return { x: 0, y: 0 }
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
}

type PinchZoomViewportProps = {
  children: ReactNode
  className?: string
  style?: CSSProperties
  minScale?: number
  maxScale?: number
  initialScale?: number
  initialPan?: { x: number; y: number }
  /** Al cambiar (p. ej. hoja del carrusel), reinicia zoom y desplazamiento. */
  resetKey?: string | number
  /** Captura el gesto desde escala 1 para que el pinch no lo absorba el navegador. */
  captureGestures?: boolean
  /** Pellizco de touchpad (Ctrl/Meta+rueda) y desplazamiento a zoom > 1. */
  trackpadGestures?: boolean
  /** Conserva el paso entre hojas con un dedo cuando no hay zoom. */
  zoomStep?: number
  onSwipeAtRest?: (direction: 'prev' | 'next') => void
}

export function PinchZoomViewport({
  children,
  className,
  style,
  minScale = DEFAULT_MIN_SCALE,
  maxScale = DEFAULT_MAX_SCALE,
  initialScale = DEFAULT_INITIAL_SCALE,
  initialPan = { x: 0, y: 0 },
  resetKey,
  captureGestures = false,
  trackpadGestures = false,
  onSwipeAtRest,
  zoomStep = 0,
}: PinchZoomViewportProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const initialScaleRef = useRef(initialScale)
  const initialPanRef = useRef(initialPan)
  initialScaleRef.current = initialScale
  initialPanRef.current = initialPan

  const [scale, setScale] = useState(initialScale)
  const [pan, setPan] = useState(initialPan)
  const scaleRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })
  const pinchRef = useRef<{ distance: number; scale: number; midpoint: { x: number; y: number } } | null>(null)
  const swipeRef = useRef<{ x: number; y: number } | null>(null)
  const panDragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const rafRef = useRef<number | null>(null)
  const pendingRef = useRef<{ scale: number; pan: { x: number; y: number } } | null>(null)

  const flushPending = useCallback(() => {
    rafRef.current = null
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null
    scaleRef.current = pending.scale
    panRef.current = pending.pan
    setScale(pending.scale)
    setPan(pending.pan)
  }, [])

  const scheduleUpdate = useCallback(
    (s: number, p: { x: number; y: number }) => {
      // Los gestos pueden generar varios eventos antes del siguiente fotograma.
      // Las referencias deben tener siempre el último valor, no el último render.
      scaleRef.current = s
      panRef.current = p
      pendingRef.current = { scale: s, pan: p }
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(flushPending)
      }
    },
    [flushPending],
  )

  const syncRefs = useCallback(
    (s: number, p: { x: number; y: number }, immediate = false) => {
      if (immediate) {
        scaleRef.current = s
        panRef.current = p
        setScale(s)
        setPan(p)
        return
      }
      scheduleUpdate(s, p)
    },
    [scheduleUpdate],
  )

  useEffect(() => {
    syncRefs(initialScale, initialPan, true)
    pinchRef.current = null
    panDragRef.current = null
  }, [resetKey, initialScale, initialPan.x, initialPan.y, syncRefs])

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const clampScale = useCallback(
    (s: number) => Math.min(maxScale, Math.max(minScale, s)),
    [maxScale, minScale],
  )

  const panForScaleAroundFocal = useCallback(
    (nextScale: number, focalClientX: number, focalClientY: number) => {
      const contentEl = contentRef.current
      if (!contentEl) return panRef.current

      const contentRect = contentEl.getBoundingClientRect()
      const previousScale = scaleRef.current
      const currentPan = panRef.current
      // getBoundingClientRect representa el último render, mientras que los
      // eventos rápidos ya pueden haber actualizado las refs (RAF pendiente).
      const baseX = contentRect.left - pan.x
      const baseY = contentRect.top - pan.y
      const ratio = nextScale / previousScale
      return {
        x: currentPan.x + (focalClientX - baseX - currentPan.x) * (1 - ratio),
        y: currentPan.y + (focalClientY - baseY - currentPan.y) * (1 - ratio),
      }
    },
    [pan.x, pan.y],
  )

  useEffect(() => {
    if (zoomStep === 0) return
    const viewport = scrollRef.current?.getBoundingClientRect()
    if (!viewport) return
    const next = clampScale(scaleRef.current * (zoomStep > 0 ? 1.4 : 1 / 1.4))
    const nextPan = panForScaleAroundFocal(next, viewport.left + viewport.width / 2, viewport.top + viewport.height / 2)
    syncRefs(next, nextPan)
  // zoomStep is an event counter; the current zoom state lives in refs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomStep])

  const isTransformed = useCallback(() => {
    const base = initialScaleRef.current
    const basePan = initialPanRef.current
    const p = panRef.current
    return (
      Math.abs(scaleRef.current - base) > 0.02 ||
      Math.abs(p.x - basePan.x) > 2 ||
      Math.abs(p.y - basePan.y) > 2
    )
  }, [])

  useEffect(() => {
    if (!trackpadGestures) return
    const node = scrollRef.current
    if (!node) return

    // Chromium (incluido Linux) entrega el pellizco de touchpad como wheel+ctrlKey.
    // El listener debe ser no pasivo para impedir zoom de la página completa.
    const onWheel = (event: WheelEvent) => {
      const isPinch = event.ctrlKey || event.metaKey
      if (!isPinch && !isTransformed()) return
      event.preventDefault()
      event.stopPropagation()
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1
      const dx = event.deltaX * unit
      const dy = event.deltaY * unit
      if (isPinch) {
        const nextScale = clampScale(scaleRef.current * Math.exp(-dy * 0.01))
        const nextPan = panForScaleAroundFocal(nextScale, event.clientX, event.clientY)
        syncRefs(nextScale, nextPan)
      } else {
        syncRefs(scaleRef.current, {
          x: panRef.current.x - dx,
          y: panRef.current.y - dy,
        })
      }
    }

    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [trackpadGestures, clampScale, isTransformed, panForScaleAroundFocal, syncRefs])

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      e.stopPropagation()
      const distance = touchDistance(e.touches)
      if (distance > 0) {
        pinchRef.current = { distance, scale: scaleRef.current, midpoint: touchMidpoint(e.touches) }
        panDragRef.current = null
        swipeRef.current = null
      }
      return
    }
    if (e.touches.length === 1 && isTransformed()) {
      e.stopPropagation()
      swipeRef.current = null
      panDragRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        panX: panRef.current.x,
        panY: panRef.current.y,
      }
    } else if (e.touches.length === 1 && onSwipeAtRest) {
      swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
  }

  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault()
      e.stopPropagation()
      const distance = touchDistance(e.touches)
      if (distance <= 0) return
      const ratio = distance / pinchRef.current.distance
      const next = clampScale(pinchRef.current.scale * ratio)
      const mid = touchMidpoint(e.touches)
      const previousMid = pinchRef.current.midpoint
      const anchored = panForScaleAroundFocal(next, previousMid.x, previousMid.y)
      const nextPan = {
        x: anchored.x + mid.x - previousMid.x,
        y: anchored.y + mid.y - previousMid.y,
      }
      pinchRef.current = { distance, scale: next, midpoint: mid }
      syncRefs(next, nextPan)
      return
    }
    if (e.touches.length === 1 && panDragRef.current) {
      e.preventDefault()
      e.stopPropagation()
      const dx = e.touches[0].clientX - panDragRef.current.x
      const dy = e.touches[0].clientY - panDragRef.current.y
      const nextPan = {
        x: panDragRef.current.panX + dx,
        y: panDragRef.current.panY + dy,
      }
      syncRefs(scaleRef.current, nextPan)
    }
  }

  const onTouchEnd = (e: TouchEvent) => {
    const wasPinching = pinchRef.current != null
    if (e.touches.length < 2) {
      pinchRef.current = null
      if (e.touches.length === 1 && wasPinching && isTransformed()) {
        panDragRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          panX: panRef.current.x,
          panY: panRef.current.y,
        }
      }
      if (e.touches.length === 0) {
        if (swipeRef.current && !isTransformed() && !wasPinching && onSwipeAtRest) {
          const touch = e.changedTouches.item(0)
          if (touch) {
            const dx = touch.clientX - swipeRef.current.x
            const dy = touch.clientY - swipeRef.current.y
            if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy)) {
              onSwipeAtRest(dx < 0 ? 'next' : 'prev')
            }
          }
        }
        swipeRef.current = null
        panDragRef.current = null
        flushPending()
      }
    }
  }

  const useGestureCapture = isTransformed() || scale < initialScale - 0.01 || scale > initialScale + 0.01

  return (
    <div
      ref={scrollRef}
      className={cn('min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain', className)}
      style={{
        touchAction: captureGestures || useGestureCapture ? 'none' : 'pan-x pan-y',
        WebkitOverflowScrolling: 'touch',
        ...style,
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div className="flex min-h-full w-full min-w-0 flex-col items-stretch justify-start">
        <div
          ref={contentRef}
          className="w-full will-change-transform"
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})`,
            transformOrigin: '0 0',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
