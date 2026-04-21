/**
 * Heurística rápida en cliente (sin IA) para rechazar fotos demasiado borrosas o vacías.
 * Usa energía media del gradiente en escala de grises (proxy de nitidez).
 */

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'))
    img.src = dataUrl
  })
}

/** Devuelve { ok, message } para mostrar al usuario antes de subir. */
export async function assessScannerImageReadability(dataUrl: string): Promise<{
  ok: boolean
  message: string
}> {
  const img = await loadImageFromDataUrl(dataUrl)
  const maxW = 480
  const scale = Math.min(maxW / img.width, maxW / img.height, 1)
  const w = Math.max(32, Math.round(img.width * scale))
  const h = Math.max(32, Math.round(img.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return { ok: false, message: 'No se pudo analizar la imagen' }
  }
  ctx.drawImage(img, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)

  const gray = new Float32Array(w * h)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = (data[i]! + data[i + 1]! + data[i + 2]!) / 3
  }

  let sumG = 0
  let count = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x
      const gx = Math.abs(gray[idx + 1]! - gray[idx - 1]!)
      const gy = Math.abs(gray[idx + w]! - gray[idx - w]!)
      sumG += gx + gy
      count++
    }
  }
  const meanGradient = count > 0 ? sumG / count : 0

  // Umbral empírico: < ~4 suele ser casi uniforme/borroso; documentos legibles suelen > 8–15.
  const MIN_GRADIENT = 5.5
  if (meanGradient < MIN_GRADIENT) {
    return {
      ok: false,
      message:
        'La imagen se ve muy borrosa o sin contraste. Acerca el albarán, más luz y enfoca antes de repetir la foto.',
    }
  }

  return { ok: true, message: 'Imagen aceptable' }
}
