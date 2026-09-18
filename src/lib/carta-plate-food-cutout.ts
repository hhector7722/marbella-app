/**
 * Recorte del fondo de estudio (blanco) para integrar la foto de un plato
 * en la vajilla del configurador Plat Marbella.
 *
 * Las fotos de carta se normalizan sobre un lienzo 4:5 blanco
 * (`normalize-product-photo`). Aquí se elimina solo el blanco conectado
 * con el borde, para no agujerear alimentos claros (arroz, salsa).
 */

export type PixelBuffer = {
  data: Uint8ClampedArray
  width: number
  height: number
}

export type StudioCutoutOptions = {
  /** Luma mínima (0–255) para considerar fondo de estudio. */
  minLuma: number
  /** Saturación máxima (0–1). El fondo de estudio es casi gris. */
  maxSat: number
  /** Distancia euclídea máxima a (255,255,255). */
  whiteDist: number
  /** Radio del fundido en el canto comida/fondo, en píxeles. */
  feather: number
  /** Alpha por debajo del cual el píxel no cuenta como comida. */
  minAlpha: number
}

export const STUDIO_CUTOUT_DEFAULTS: StudioCutoutOptions = {
  minLuma: 218,
  maxSat: 0.16,
  whiteDist: 58,
  feather: 3,
  minAlpha: 14,
}

export type StudioCutoutResult = {
  buffer: PixelBuffer
  /** Fracción de píxeles marcados como fondo de estudio y vaciados. */
  removedRatio: number
  /** Fracción de píxeles que siguen opacos tras el recorte. */
  opaqueRatio: number
}

export function isStudioBackdropPixel(
  r: number,
  g: number,
  b: number,
  a: number,
  opts: StudioCutoutOptions = STUDIO_CUTOUT_DEFAULTS
): boolean {
  if (a < 10) return true
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const sat = max === 0 ? 0 : (max - min) / max
  if (sat > opts.maxSat) return false
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
  if (luma < opts.minLuma) return false
  return Math.hypot(255 - r, 255 - g, 255 - b) <= opts.whiteDist
}

function pixelIndex(x: number, y: number, width: number): number {
  return y * width + x
}

/**
 * Vacía el blanco de estudio conectado con el borde. Copia el buffer.
 */
export function knockoutStudioBackground(
  input: PixelBuffer,
  options?: Partial<StudioCutoutOptions>
): StudioCutoutResult {
  const opts = { ...STUDIO_CUTOUT_DEFAULTS, ...options }
  const { width: w, height: h } = input
  const n = w * h
  const data = new Uint8ClampedArray(input.data)
  const candidate = new Uint8Array(n)

  for (let i = 0; i < n; i++) {
    const o = i * 4
    if (isStudioBackdropPixel(data[o]!, data[o + 1]!, data[o + 2]!, data[o + 3]!, opts)) {
      candidate[i] = 1
    }
  }

  const removed = new Uint8Array(n)
  const queue: number[] = []
  const enqueue = (i: number) => {
    if (i < 0 || i >= n || candidate[i] === 0 || removed[i] === 1) return
    removed[i] = 1
    queue.push(i)
  }

  const border = Math.min(2, Math.min(w, h))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < border || y < border || x >= w - border || y >= h - border) {
        enqueue(pixelIndex(x, y, w))
      }
    }
  }

  let qi = 0
  while (qi < queue.length) {
    const i = queue[qi]!
    qi += 1
    const x = i % w
    const y = (i / w) | 0
    if (x > 0) enqueue(i - 1)
    if (x + 1 < w) enqueue(i + 1)
    if (y > 0) enqueue(i - w)
    if (y + 1 < h) enqueue(i + w)
  }

  let removedCount = 0
  for (let i = 0; i < n; i++) {
    if (removed[i] === 1) {
      data[i * 4 + 3] = 0
      removedCount += 1
    }
  }

  if (opts.feather > 0) {
    const feather = opts.feather
    const nextAlpha = new Uint8Array(n)
    for (let i = 0; i < n; i++) nextAlpha[i] = data[i * 4 + 3]!
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = pixelIndex(x, y, w)
        if (removed[i] === 1) continue
        const alpha = data[i * 4 + 3]!
        if (alpha < opts.minAlpha) continue
        let minDist = feather + 1
        for (let dy = -feather; dy <= feather; dy++) {
          for (let dx = -feather; dx <= feather; dx++) {
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
            if (removed[pixelIndex(nx, ny, w)] !== 1) continue
            const dist = Math.max(Math.abs(dx), Math.abs(dy))
            if (dist < minDist) minDist = dist
          }
        }
        if (minDist <= feather) {
          nextAlpha[i] = Math.round(alpha * (minDist / (feather + 0.5)))
        }
      }
    }
    for (let i = 0; i < n; i++) data[i * 4 + 3] = nextAlpha[i]!
  }

  let opaqueCount = 0
  for (let i = 0; i < n; i++) {
    if (data[i * 4 + 3]! >= opts.minAlpha) opaqueCount += 1
  }

  return {
    buffer: { data, width: w, height: h },
    removedRatio: n === 0 ? 0 : removedCount / n,
    opaqueRatio: n === 0 ? 0 : opaqueCount / n,
  }
}

export type OpaqueBounds = { x: number; y: number; w: number; h: number }

export function opaqueBounds(
  buf: PixelBuffer,
  minAlpha: number = STUDIO_CUTOUT_DEFAULTS.minAlpha
): OpaqueBounds | null {
  const { width, height, data } = buf
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! < minAlpha) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (maxX < minX || maxY < minY) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

export function cropPixelBuffer(buf: PixelBuffer, box: OpaqueBounds, pad = 1): PixelBuffer {
  const x0 = Math.max(0, box.x - pad)
  const y0 = Math.max(0, box.y - pad)
  const x1 = Math.min(buf.width, box.x + box.w + pad)
  const y1 = Math.min(buf.height, box.y + box.h + pad)
  const w = Math.max(1, x1 - x0)
  const h = Math.max(1, y1 - y0)
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    const srcOff = ((y0 + y) * buf.width + x0) * 4
    data.set(buf.data.subarray(srcOff, srcOff + w * 4), y * w * 4)
  }
  return { data, width: w, height: h }
}

/** Hay suficiente fondo de estudio y queda comida: la foto se puede servir sin blanco. */
export function isIsolatedStudioCutout(result: Pick<StudioCutoutResult, 'removedRatio' | 'opaqueRatio'>): boolean {
  return result.removedRatio >= 0.08 && result.opaqueRatio >= 0.04
}
