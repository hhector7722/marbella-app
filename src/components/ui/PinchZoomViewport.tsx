'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
} from 'react'
import { cn } from '@/lib/utils'

const MIN_SCALE = 1
const MAX_SCALE = 4

function touchDistance(touches: TouchEvent['touches']) {
  if (touches.length < 2) return 0
  const a = touches.item(0)
  const b = touches.item(1)
  if (!a || !b) return 0
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}

type PinchZoomViewportProps = {
  children: ReactNode
  className?: string
  style?: React.CSSProperties
  /** Al cambiar (p. ej. hoja del carrusel), reinicia zoom y desplazamiento. */
  resetKey?: string | number
}

function touchMidpoint(touches: TouchEvent['touches']) {
  if (touches.length < 2) return { x: 0, y: 0 }
  const a = touches.item(0)
  const b = touches.item(1)
  if (!a || !b) return { x: 0, y: 0 }
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
}

export function PinchZoomViewport({ children, className, style, resetKey }: PinchZoomViewportProps) {
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const scaleRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null)
  const panDragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)

  const syncRefs = useCallback((s: number, p: { x: number; y: number }) => {
    scaleRef.current = s
    panRef.current = p
    setScale(s)
    setPan(p)
  }, [])

  useEffect(() => {
    syncRefs(1, { x: 0, y: 0 })
    pinchRef.current = null
    panDragRef.current = null
  }, [resetKey, syncRefs])

  const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))

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
    if (e.touches.length === 1 && scaleRef.current > 1) {
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
      const prevScale = scaleRef.current
      const scaleRatio = next / prevScale
      const pan = panRef.current
      const nextPan = {
        x: mid.x - scaleRatio * (mid.x - pan.x),
        y: mid.y - scaleRatio * (mid.y - pan.y),
      }
      syncRefs(next, nextPan)
      return
    }
    if (e.touches.length === 1 && panDragRef.current && scaleRef.current > 1) {
      e.preventDefault()
      e.stopPropagation()
      const dx = e.touches[0].clientX - panDragRef.current.x
      const dy = e.touches[0].clientY - panDragRef.current.y
      setPan({
        x: panDragRef.current.panX + dx,
        y: panDragRef.current.panY + dy,
      })
      panRef.current = {
        x: panDragRef.current.panX + dx,
        y: panDragRef.current.panY + dy,
      }
    }
  }

  const onTouchEnd = (e: TouchEvent) => {
    if (e.touches.length < 2) {
      pinchRef.current = null
      if (e.touches.length === 0) {
        panDragRef.current = null
        if (scaleRef.current <= 1.02) {
          syncRefs(1, { x: 0, y: 0 })
        }
      }
    }
  }

  return (
    <div
      className={cn('flex min-h-0 flex-1 overflow-auto overscroll-contain', className)}
      style={{ touchAction: scale > 1 ? 'none' : 'pan-x pan-y', ...style }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div className="flex min-h-full w-full min-w-0 flex-1 items-center justify-center p-1">
        <div
          className="inline-block max-w-full will-change-transform"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: '0 0',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
