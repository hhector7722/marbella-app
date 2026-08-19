'use client'

import { Modal } from '@/components/ui/modal'

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
  if (!src) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title || alt}
      headerTitleAlign="left"
      className="max-h-[min(94vh,960px)] w-full max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl"
      wrapperClassName="max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl"
      layer="derived"
      backdropClassName="bg-black/80"
      usageId="carta-image-lightbox"
      usageLabel="Imagen carta"
    >
      <div className="flex min-h-0 flex-1 items-center justify-center bg-zinc-50/40 p-6 sm:p-8 md:p-10">
        {/* eslint-disable-next-line @next/next/no-img-element -- URL externa / Storage */}
        <img
          src={src}
          alt={alt}
          className="max-h-[min(68vh,680px)] w-full max-w-full object-contain"
        />
      </div>
    </Modal>
  )
}
