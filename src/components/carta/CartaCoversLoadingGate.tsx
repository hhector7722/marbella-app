'use client'

import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { uniqueCartaCoverUrls, useCartaImagesPreloaded } from '@/lib/carta-cover-preload'

export function CartaCoversLoadingGate({
  urls,
  children,
  className,
  spinnerClassName,
  /** Modal compacto (selector subcategorías): altura según contenido, sin relleno. */
  fitContent = false,
  preloaded = false,
}: {
  urls: (string | null | undefined)[]
  children: ReactNode
  className?: string
  spinnerClassName?: string
  fitContent?: boolean
  /** La pantalla exterior ya ha terminado de precargar este conjunto. */
  preloaded?: boolean
}) {
  const expected = uniqueCartaCoverUrls(urls)
  const ready = useCartaImagesPreloaded(preloaded ? [] : expected)

  if (!ready) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-white',
          fitContent ? 'px-6 py-5' : 'min-h-0 flex-1',
          className
        )}
        role="status"
        aria-live="polite"
        aria-label="Cargando imágenes"
      >
        <Loader2
          className={cn(
            'h-9 w-9 animate-spin text-[#36606F] sm:h-10 sm:w-10',
            spinnerClassName
          )}
          strokeWidth={2.25}
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        fitContent ? 'w-fit max-w-full' : 'flex min-h-0 flex-1 flex-col',
        className
      )}
    >
      {children}
    </div>
  )
}
