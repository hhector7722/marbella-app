'use client'

import { useEffect, useMemo, useState } from 'react'

export function uniqueCartaCoverUrls(urls: (string | null | undefined)[]): string[] {
  const seen = new Set<string>()
  for (const u of urls) {
    const t = u?.trim()
    if (t) seen.add(t)
  }
  return [...seen]
}

export function preloadCartaCoverImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve()
    img.onerror = () => resolve()
    img.src = url
  })
}

export async function preloadCartaCoverImages(urls: string[]): Promise<void> {
  if (urls.length === 0) return
  await Promise.all(urls.map(preloadCartaCoverImage))
}

export function useCartaCoverImagesReady(urls: string[]): boolean {
  const stableKey = useMemo(
    () => urls.slice().sort().join('\0'),
    [urls.slice().sort().join('\0')]
  )
  const [ready, setReady] = useState(urls.length === 0)

  useEffect(() => {
    if (urls.length === 0) {
      setReady(true)
      return
    }
    let cancelled = false
    setReady(false)
    void preloadCartaCoverImages(urls).then(() => {
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [stableKey])

  return ready
}
