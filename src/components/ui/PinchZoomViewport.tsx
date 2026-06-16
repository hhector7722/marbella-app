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

const DEFAULT_MIN_SCALE = 0.65
const DEFAULT_MAX_SCALE = 4

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
  /** Al cambiar (p. ej. hoja del carrusel), reinicia zoom y desplazamiento. */
  resetKey?: string | number
}

export function PinchZoomViewport({
  children,
  className,
  style,
  minScale = DEFAULT_MIN_SCALE,
  maxScale = DEFAULT_MAX_SCALE,
  resetKey,
}: PinchZoomViewportProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const scaleRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null)
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
    syncRefs(1, { x: 0, y: 0 }, true)
    pinchRef.current = null
    panDragRef.current = null
  }, [resetKey, syncRefs])

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
      const scrollEl = scrollRef.current
      const contentEl = contentRef.current
      if (!scrollEl || !contentEl) return panRef.current

      const scrollRect = scrollEl.getBoundingClientRect()
      const contentRect = contentEl.getBoundingClientRect()
      const prevScale = scaleRef.current
      const pan = panRef.current

      const anchorX =
        focalClientX - scrollRect.left + scrollEl.scrollLeft - (contentRect.left - scrollRect.left + scrollEl.scrollLeft)
      const anchorY =
        focalClientY - scrollRect.top + scrollEl.scrollTop - (contentRect.top - scrollRect.top + scrollEl.scrollTop)

      const ratio = nextScale / prevScale
      return {
        x: anchorX - ratio * (anchorX - pan.x),
        y: anchorY - ratio * (anchorY - pan.y),
      }
    },
    [],
  )

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      e.stopPropagation()
      const distance = touchDistance(e.touches)
      if (distance > 0) {
        pinchRef.current = { distance, scale: scaleRef.current }
        panDragRef.current = null
      }
      return
    }
    if (e.touches.length === 1 && scaleRef.current > 1.01) {
      e.stopPropagation()
      panDragRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        panX: panRef.current.x,
        panY: panRef.current.y,
      }
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
      const nextPan = panForScaleAroundFocal(next, mid.x, mid.y)
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
    if (e.touches.length < 2) {
      pinchRef.current = null
      if (e.touches.length === 0) {
        panDragRef.current = null
        flushPending()
        if (scaleRef.current < 1.02) {
          syncRefs(1, { x: 0, y: 0 }, true)
        }
      }
    }
  }

  const canPan = scale > 1.01

  return (
    <div
      ref={scrollRef}
      className={cn('min-h-0 flex-1 overflow-auto overscroll-contain', className)}
      style={{
        touchAction: canPan ? 'none' : 'pan-x pan-y',
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
