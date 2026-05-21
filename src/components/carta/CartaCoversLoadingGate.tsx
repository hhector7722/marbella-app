'use client'

import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { uniqueCartaCoverUrls, useCartaImagesPreloaded } from '@/lib/carta-cover-preload'

export function CartaCoversLoadingGate({
  urls,
  children,
  className,
  spinnerClassName,
}: {
  urls: (string | null | undefined)[]
  children: ReactNode
  className?: string
  spinnerClassName?: string
}) {
  const expected = useMemo(
    () => uniqueCartaCoverUrls(urls),
    [urls.map((u) => u?.trim() ?? '').filter(Boolean).sort().join('|')]
  )
  const ready = useCartaImagesPreloaded(expected)

  return (
    <div className={cn('relative min-h-[200px] flex-1', className)}>
      {!ready ? (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-white"
          role="status"
          aria-live="polite"
          aria-label="Cargando imágenes"
        >
          <Loader2
            className={cn(
              'h-10 w-10 animate-spin text-[#36606F] sm:h-11 sm:w-11',
              spinnerClassName
            )}
            strokeWidth={2.25}
          />
        </div>
      ) : null}
      {ready ? <div className="h-full w-full">{children}</div> : null}
    </div>
  )
}
