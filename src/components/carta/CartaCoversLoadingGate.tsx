'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { uniqueCartaCoverUrls, useCartaCoverUrlsKey } from '@/lib/carta-cover-preload'

type CartaCoversLoadContextValue = {
  reportLoaded: (url: string) => void
}

const CartaCoversLoadContext = createContext<CartaCoversLoadContextValue | null>(null)

export function useCartaCoversLoadContext() {
  return useContext(CartaCoversLoadContext)
}

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
  const urlKey = useCartaCoverUrlsKey(expected)
  const [loadedUrls, setLoadedUrls] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    setLoadedUrls(new Set())
  }, [urlKey])

  const reportLoaded = useCallback((url: string) => {
    const t = url.trim()
    if (!t) return
    setLoadedUrls((prev) => {
      if (prev.has(t)) return prev
      const next = new Set(prev)
      next.add(t)
      return next
    })
  }, [])

  const ready =
    expected.length === 0 || expected.every((url) => loadedUrls.has(url))

  const ctx = useMemo(() => ({ reportLoaded }), [reportLoaded])

  return (
    <CartaCoversLoadContext.Provider value={ctx}>
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
        <div
          className={cn(
            'h-full w-full',
            !ready &&
              'pointer-events-none absolute inset-0 overflow-hidden opacity-0'
          )}
          aria-hidden={!ready}
        >
          {children}
        </div>
      </div>
    </CartaCoversLoadContext.Provider>
  )
}
