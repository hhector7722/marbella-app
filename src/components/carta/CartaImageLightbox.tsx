'use client'

import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function CartaImageLightbox({
  src,
  alt,
  open,
  onClose,
}: {
  src: string | null
  alt: string
  open: boolean
  onClose: () => void
}) {
  if (!open || !src) return null

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Imagen ampliada"
    >
      <button
        type="button"
        className="absolute right-2 top-2 flex min-h-[48px] min-w-[48px] items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 md:right-4 md:top-4"
        onClick={onClose}
        aria-label="Cerrar"
      >
        <X className="h-6 w-6" strokeWidth={2.5} />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- URL externa / Storage */}
      <img
        src={src}
        alt={alt}
        className={cn('max-h-[min(88vh,920px)] w-auto max-w-[95vw] object-contain')}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}
