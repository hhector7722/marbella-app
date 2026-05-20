'use client'

import { useMemo } from 'react'

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
