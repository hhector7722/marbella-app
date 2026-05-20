'use client'

import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PinchZoomViewport } from '@/components/ui/PinchZoomViewport'

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
        <PinchZoomViewport
          resetKey={src}
          className="rounded-2xl border border-white/10 bg-black/40 shadow-2xl"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt || ''}
            className="max-h-[min(72dvh,calc(100svh-11rem))] w-auto max-w-full object-contain sm:max-h-[min(78vh,calc(100vh-11rem))]"
            draggable={false}
          />
        </PinchZoomViewport>

        <div className="mt-2 flex shrink-0 justify-center pb-[max(10px,env(safe-area-inset-bottom))] pt-1 sm:mt-3">
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
