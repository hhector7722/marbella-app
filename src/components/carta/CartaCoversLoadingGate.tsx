'use client'

import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { uniqueCartaCoverUrls, useCartaCoverImagesReady } from '@/lib/carta-cover-preload'

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
  const list = useMemo(
    () => uniqueCartaCoverUrls(urls),
    [urls.map((u) => u?.trim() ?? '').filter(Boolean).sort().join('|')]
  )
  const ready = useCartaCoverImagesReady(list)

  if (!ready) {
    return (
      <div
        className={cn(
          'flex min-h-[min(42vh,280px)] flex-1 items-center justify-center py-10',
          className
        )}
        role="status"
        aria-live="polite"
        aria-label="Cargando imágenes"
      >
        <Loader2
          className={cn('h-9 w-9 animate-spin text-[#36606F] sm:h-10 sm:w-10', spinnerClassName)}
          strokeWidth={2.25}
        />
      </div>
    )
  }

  return <>{children}</>
}
