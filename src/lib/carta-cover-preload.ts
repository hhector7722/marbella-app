'use client'

import { useEffect, useMemo, useState } from 'react'

export const CARTA_IMAGE_PRELOAD_TIMEOUT_MS = 12_000

export function uniqueCartaCoverUrls(urls: (string | null | undefined)[]): string[] {
  const seen = new Set<string>()
  for (const u of urls) {
    const t = u?.trim()
    if (t) seen.add(t)
  }
  return [...seen]
}

/** Clave estable para efectos de precarga / gate. */
export function cartaCoverUrlsKey(urls: string[]): string {
  return urls.slice().sort().join('\0')
}

export function useCartaCoverUrlsKey(urls: string[]): string {
  return useMemo(() => cartaCoverUrlsKey(urls), [cartaCoverUrlsKey(urls)])
}

/** Precarga en paralelo; onerror cuenta como resuelto; timeout evita spinner infinito. */
export function preloadCartaImages(
  urls: string[],
  timeoutMs = CARTA_IMAGE_PRELOAD_TIMEOUT_MS
): Promise<void> {
  if (urls.length === 0) return Promise.resolve()

  return new Promise((resolve) => {
    let settled = false
    const done = new Set<string>()
    const finish = (url: string) => {
      if (settled || done.has(url)) return
      done.add(url)
      if (done.size >= urls.length) {
        settled = true
        clearTimeout(timer)
        resolve()
      }
    }
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        resolve()
      }
    }, timeoutMs)

    for (const url of urls) {
      const img = new Image()
      img.decoding = 'async'
      const onDone = () => finish(url)
      img.onload = onDone
      img.onerror = onDone
      img.src = url
      if (img.complete) onDone()
    }
  })
}

export function useCartaImagesPreloaded(urls: string[]): boolean {
  const stableKey = useMemo(
    () => cartaCoverUrlsKey(urls),
    [cartaCoverUrlsKey(urls)]
  )
  const [ready, setReady] = useState(urls.length === 0)

  useEffect(() => {
    if (urls.length === 0) {
      setReady(true)
      return
    }
    let cancelled = false
    setReady(false)
    void preloadCartaImages(urls).then(() => {
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [stableKey, urls])

  return ready
}
