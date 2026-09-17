'use client'

import { useEffect, useState } from 'react'
import {
  cropPixelBuffer,
  isIsolatedStudioCutout,
  knockoutStudioBackground,
  opaqueBounds,
  type PixelBuffer,
} from '@/lib/carta-plate-food-cutout'

export type StudioCutoutView = {
  href: string
  isolated: boolean
}

const MAX_PROCESS_WIDTH = 360
const cache = new Map<string, StudioCutoutView>()
const inflight = new Map<string, Promise<StudioCutoutView>>()

function decodeImage(href: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', () => reject(new Error('cutout: load failed')))
    image.src = href
  })
}

/** `fetch` + blob evita el caché sin CORS que tizna el canvas. */
async function loadImage(src: string): Promise<{ image: HTMLImageElement; revoke?: () => void }> {
  if (src.startsWith('blob:') || src.startsWith('data:')) {
    return { image: await decodeImage(src) }
  }
  const res = await fetch(src, { mode: 'cors', credentials: 'omit' })
  if (!res.ok) throw new Error('cutout: fetch failed')
  const objectUrl = URL.createObjectURL(await res.blob())
  try {
    const image = await decodeImage(objectUrl)
    return { image, revoke: () => URL.revokeObjectURL(objectUrl) }
  } catch (err) {
    URL.revokeObjectURL(objectUrl)
    throw err
  }
}

function canvasToView(canvas: HTMLCanvasElement, isolated: boolean): Promise<StudioCutoutView> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('cutout: blob failed'))
          return
        }
        resolve({ href: URL.createObjectURL(blob), isolated })
      },
      'image/png'
    )
  })
}

async function processStudioCutout(src: string): Promise<StudioCutoutView> {
  const loaded = await loadImage(src)
  try {
    const image = loaded.image
    const scale = Math.min(1, MAX_PROCESS_WIDTH / Math.max(1, image.naturalWidth))
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return { href: src, isolated: false }

    ctx.drawImage(image, 0, 0, width, height)
    const raw = ctx.getImageData(0, 0, width, height)
    const input: PixelBuffer = { data: raw.data, width, height }
    const knocked = knockoutStudioBackground(input)
    if (!isIsolatedStudioCutout(knocked)) return { href: src, isolated: false }

    const box = opaqueBounds(knocked.buffer)
    const cropped = box ? cropPixelBuffer(knocked.buffer, box, 1) : knocked.buffer
    const out = document.createElement('canvas')
    out.width = cropped.width
    out.height = cropped.height
    const outCtx = out.getContext('2d')
    if (!outCtx) return { href: src, isolated: false }
    const imageData = outCtx.createImageData(cropped.width, cropped.height)
    imageData.data.set(cropped.data)
    outCtx.putImageData(imageData, 0, 0)
    return canvasToView(out, true)
  } finally {
    loaded.revoke?.()
  }
}

function cutoutFor(src: string): Promise<StudioCutoutView> {
  const cached = cache.get(src)
  if (cached) return Promise.resolve(cached)
  const pending = inflight.get(src)
  if (pending) return pending
  const next = processStudioCutout(src)
    .then((view) => {
      cache.set(src, view)
      inflight.delete(src)
      return view
    })
    .catch(() => {
      inflight.delete(src)
      const fallback = { href: src, isolated: false }
      cache.set(src, fallback)
      return fallback
    })
  inflight.set(src, next)
  return next
}

/** Foto de carta sin el blanco de estudio, lista para la vajilla (o la original si no se puede recortar). */
export function useStudioCutout(src: string | null): StudioCutoutView | null {
  const [view, setView] = useState<StudioCutoutView | null>(() => (src ? cache.get(src) ?? null : null))

  useEffect(() => {
    if (!src) {
      setView(null)
      return
    }
    const cached = cache.get(src)
    if (cached) {
      setView(cached)
      return
    }
    let cancelled = false
    void cutoutFor(src).then((next) => {
      if (!cancelled) setView(next)
    })
    return () => {
      cancelled = true
    }
  }, [src])

  return view
}
