'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
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
  // La imagen cambia de producto sin desmontar siempre el visor:
  // una imagen anterior nunca debe marcar una URL nueva como cargada.
  const [readySrc, setReadySrc] = useState<string | null>(null)
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  if (!src) return null

  const ready = readySrc === src
  const failed = failedSrc === src

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title || alt}
      headerTitleAlign="left"
      variant="work"
      layer={parentInstance ? 'derived' : 'base'}
      dismissScope="self"
      {...(parentInstance ? { parentInstance } : {})}
      backdropClassName="bg-black/80"
      scrollContent={false}
      usageId="carta-image-lightbox"
      usageLabel="Imagen carta"
    >
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-zinc-50/40">
        {!ready && !failed ? (
          <Loader2
            className="absolute h-9 w-9 animate-spin text-[#36606F]"
            aria-label="Cargando imagen"
            role="status"
            strokeWidth={2.2}
          />
        ) : null}
        {failed ? (
          <p className="px-4 text-center text-sm text-zinc-500" role="alert">
            No se ha podido cargar la imagen.
          </p>
        ) : null}
        {/* eslint-disable-next-line @next/next/no-img-element -- URL externa / Storage */}
        <img
          key={src}
          src={src}
          alt={alt}
          onLoad={(event) => {
            const image = event.currentTarget
            void image.decode().catch(() => {}).then(() => setReadySrc(src))
          }}
          onError={() => setFailedSrc(src)}
          className="absolute inset-0 h-full w-full max-w-full object-contain"
          style={{ visibility: ready && !failed ? 'visible' : 'hidden' }}
        />
      </div>
    </Modal>
  )
}
