'use client'

import { X } from 'lucide-react'

export function CartaImageLightbox({
  src,
  alt,
  title,
  open,
  onClose,
}: {
  src: string | null
  alt: string
  /** Texto en la cabecera petróleo (normalmente el nombre del plato). */
  title: string
  open: boolean
  onClose: () => void
}) {
  if (!open || !src) return null

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm md:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="carta-lightbox-title"
      aria-label="Imagen ampliada"
    >
      <div
        className="flex max-h-[min(92vh,920px)] w-full max-w-[calc((min(100vw,42rem)-5.5rem)/2)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-w-[calc((min(100vw,42rem)-6rem)/2)] md:max-w-[calc((min(100vw,42rem)-5rem)/2)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="relative flex min-h-[52px] shrink-0 items-center justify-center bg-[#36606F] px-12 py-3 text-white md:min-h-[56px] md:px-14">
          <h2
            id="carta-lightbox-title"
            className="line-clamp-2 text-center text-sm font-black leading-snug text-white md:text-base"
          >
            {title || alt}
          </h2>
          <button
            type="button"
            className="absolute right-2 top-1/2 flex min-h-[48px] min-w-[48px] -translate-y-1/2 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/15 active:bg-white/10 md:right-3"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X className="h-6 w-6" strokeWidth={2.5} />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL externa / Storage */}
          <img
            src={src}
            alt={alt}
            className="max-h-[min(58vh,520px)] w-auto max-w-full border-0 object-contain p-0 outline-none ring-0 sm:max-h-[min(62vh,560px)]"
          />
        </div>
      </div>
    </div>
  )
}
