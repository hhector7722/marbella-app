'use client'

import { Modal } from '@/components/ui/modal'

export function CartaImageLightbox({
  src,
  alt,
  title,
  open,
  onClose,
  parentInstance,
}: {
  src: string | null
  alt: string
  /** Texto en la cabecera (normalmente el nombre del plato). */
  title: string
  open: boolean
  onClose: () => void
  /** Solo cuando el lightbox se abre sobre un Modal padre aún montado. */
  parentInstance?: string
}) {
  if (!src) return null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title || alt}
      headerTitleAlign="left"
      variant="work"
      layer={parentInstance ? 'derived' : 'base'}
      {...(parentInstance ? { parentInstance } : {})}
      backdropClassName="bg-black/80"
      usageId="carta-image-lightbox"
      usageLabel="Imagen carta"
    >
      <div className="flex min-h-0 flex-1 items-center justify-center bg-zinc-50/40">
        {/* eslint-disable-next-line @next/next/no-img-element -- URL externa / Storage */}
        <img
          src={src}
          alt={alt}
          className="h-full w-full max-w-full object-contain"
        />
      </div>
    </Modal>
  )
}
