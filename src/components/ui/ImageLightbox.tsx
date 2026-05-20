'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { X, ZoomIn, ZoomOut } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ImageLightbox({
  open,
  src,
  alt,
  onClose,
  className,
}: {
  open: boolean
  src: string | null | undefined
  alt?: string
  onClose: () => void
  className?: string
}) {
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    if (open) setZoom(1)
  }, [open, src])

  const clampZoom = useCallback((z: number) => Math.min(3, Math.max(1, Math.round(z * 20) / 20)), [])

  if (!open || !src) return null

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
    >
      <div
        className="flex min-h-0 flex-1 flex-col px-3 pb-2 pt-1 sm:px-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex min-h-0 flex-1 overflow-auto overscroll-contain rounded-2xl border border-white/10 bg-black/40 shadow-2xl"
          style={{ touchAction: 'pan-x pan-y pinch-zoom' }}
          onWheel={(e) => {
            if (!e.ctrlKey && !e.metaKey) return
            e.preventDefault()
            setZoom((z) => {
              const step = 0.2
              const next = e.deltaY > 0 ? z - step : z + step
              return clampZoom(next)
            })
          }}
        >
          <div className="flex min-h-full min-w-0 flex-1 items-center justify-center p-3 sm:p-5">
            <div className="inline-block max-w-full" style={{ zoom } as CSSProperties}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={alt || ''}
                className="max-h-[min(72dvh,calc(100svh-11rem))] w-auto max-w-full object-contain sm:max-h-[min(78vh,calc(100vh-11rem))]"
                draggable={false}
              />
            </div>
          </div>
        </div>

        <div className="mt-2 flex shrink-0 items-center justify-between gap-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-1 sm:mt-3">
          <div className="flex items-center gap-1.5 text-white">
            <button
              type="button"
              aria-label="Alejar"
              disabled={zoom <= 1}
              onClick={() => setZoom((z) => clampZoom(z - 0.25))}
              className={cn(
                'inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 transition hover:bg-white/20 active:scale-[0.99]',
                zoom <= 1 && 'pointer-events-none opacity-40',
              )}
            >
              <ZoomOut className="h-6 w-6" strokeWidth={2.25} />
            </button>
            <span className="min-w-[3.25rem] text-center text-xs font-black tabular-nums text-zinc-200">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              aria-label="Acercar"
              disabled={zoom >= 3}
              onClick={() => setZoom((z) => clampZoom(z + 0.25))}
              className={cn(
                'inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 transition hover:bg-white/20 active:scale-[0.99]',
                zoom >= 3 && 'pointer-events-none opacity-40',
              )}
            >
              <ZoomIn className="h-6 w-6" strokeWidth={2.25} />
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-black uppercase tracking-wide text-zinc-900 shadow-md transition hover:bg-zinc-100 active:scale-[0.99]"
            aria-label="Cerrar imagen"
          >
            <X className="h-5 w-5 shrink-0" strokeWidth={2.5} />
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
