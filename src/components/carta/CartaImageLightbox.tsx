'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useScrollLock } from '@/hooks/useScrollLock'

export function CartaImageLightbox({
  src,
  alt,
  title,
  open,
  onClose,
}: {
  src: string | null
  alt: string
  /** Texto en la cabecera (normalmente el nombre del plato). */
  title: string
  open: boolean
  onClose: () => void
}) {
  const [portalReady, setPortalReady] = useState(false)
  useScrollLock(open && Boolean(src))

  useEffect(() => {
    setPortalReady(true)
  }, [])

  if (!open || !src || !portalReady) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-4 sm:p-6 md:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="carta-lightbox-title"
      aria-label="Imagen ampliada. Pulsa fuera para cerrar."
    >
      <div
        className="flex max-h-[min(94svh,960px)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-w-lg md:max-w-xl lg:max-w-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-zinc-100 bg-white px-5 py-4 sm:px-6 sm:py-5">
          <h2
            id="carta-lightbox-title"
            className="min-w-0 text-center text-sm font-black uppercase leading-snug tracking-wide text-[#36606F] sm:text-base"
          >
            {title || alt}
          </h2>
        </header>

        <div className="flex min-h-0 flex-1 items-center justify-center bg-zinc-50/40 p-6 sm:p-8 md:p-10">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL externa / Storage */}
          <img
            src={src}
            alt={alt}
            className="max-h-[min(68svh,680px)] w-full max-w-full object-contain"
          />
        </div>
      </div>
    </div>,
    document.body
  )
}
