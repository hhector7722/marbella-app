'use client'

import { useEffect, useState } from 'react'

export const CARTA_IMAGE_PRELOAD_TIMEOUT_MS = 5_000

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
  return cartaCoverUrlsKey(urls)
}

/** Una misma lista no se descarga ni bloquea dos veces.
 * Se guarda la finalización, incluidos errores de imagen y el timeout,
 * para que React no vuelva a mostrar el spinner durante un rerender.
 */
const preloadedSets = new Set<string>()
const pendingSets = new Map<string, Promise<void>>()

export function isCartaImagesPreloaded(urls: string[]): boolean {
  return urls.length === 0 || preloadedSets.has(cartaCoverUrlsKey(urls))
}

export function preloadCartaImages(
  urls: string[],
  timeoutMs = CARTA_IMAGE_PRELOAD_TIMEOUT_MS
): Promise<void> {
  if (urls.length === 0) return Promise.resolve()
  const stableKey = cartaCoverUrlsKey(urls)
  if (preloadedSets.has(stableKey)) return Promise.resolve()
  const pending = pendingSets.get(stableKey)
  if (pending) return pending

  const task = new Promise<void>((resolve) => {
    let settled = false
    const done = new Set<string>()
    const finishAll = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      preloadedSets.add(stableKey)
      pendingSets.delete(stableKey)
      resolve()
    }
    const finish = (url: string) => {
      if (settled || done.has(url)) return
      done.add(url)
      if (done.size >= urls.length) finishAll()
    }
    const timer = setTimeout(finishAll, timeoutMs)
    for (const url of urls) {
      const img = new Image()
      img.decoding = 'async'
      const onLoad = () => {
        // onload no garantiza que el bitmap esté decodificado para pintar.
        // Finalizar después del decode evita que las imágenes aparezcan a saltos.
        void img.decode().catch(() => {}).then(() => finish(url))
      }
      img.onload = onLoad
      img.onerror = () => finish(url)
      img.src = url
      if (img.complete) {
        if (img.naturalWidth > 0) onLoad()
        else finish(url)
      }
    }
  })
  pendingSets.set(stableKey, task)
  return task
}

export function useCartaImagesPreloaded(urls: string[]): boolean {
  const stableKey = cartaCoverUrlsKey(urls)
  const [state, setState] = useState<{ key: string; ready: boolean }>(() => ({
    key: stableKey,
    ready: isCartaImagesPreloaded(urls),
  }))

  useEffect(() => {
    if (isCartaImagesPreloaded(urls)) return
    let cancelled = false
    void preloadCartaImages(urls).then(() => {
      if (!cancelled) setState({ key: stableKey, ready: true })
    })
    return () => {
      cancelled = true
    }
  // stableKey representa el conjunto completo; la identidad del array cambia en cada render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableKey])

  return isCartaImagesPreloaded(urls) || (state.key === stableKey && state.ready)
}
