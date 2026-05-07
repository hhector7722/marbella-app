'use client'

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
      aria-label="Imagen ampliada. Pulsa fuera para cerrar."
    >
      <div
        className="flex max-h-[min(92vh,920px)] w-full max-w-[calc((min(100vw,42rem)-5.5rem)/2)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-w-[calc((min(100vw,42rem)-6rem)/2)] md:max-w-[calc((min(100vw,42rem)-5rem)/2)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center border-b border-zinc-100 bg-white px-3 py-2 sm:px-3.5 sm:py-2.5">
          <h2
            id="carta-lightbox-title"
            className="min-w-0 flex-1 text-left text-xs font-black uppercase leading-tight tracking-wide text-[#36606F] line-clamp-2 sm:text-sm"
          >
            {title || alt}
          </h2>
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
