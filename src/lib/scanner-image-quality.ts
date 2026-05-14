/**
 * Heurística rápida en cliente (sin IA) antes de subir: nitidez (gradiente medio),
 * variación de luminancia (rechaza superficies uniformes) y densidad de bordes fuertes
 * (proxy de texto/tablas en el albarán).
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

  let sumL = 0
  for (let p = 0; p < gray.length; p++) sumL += gray[p]!
  const meanL = gray.length > 0 ? sumL / gray.length : 0
  let varSum = 0
  for (let p = 0; p < gray.length; p++) {
    const d = gray[p]! - meanL
    varSum += d * d
  }
  const lumaStd = gray.length > 0 ? Math.sqrt(varSum / gray.length) : 0

  let strongEdges = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x
      const gx = Math.abs(gray[idx + 1]! - gray[idx - 1]!)
      const gy = Math.abs(gray[idx + w]! - gray[idx - w]!)
      if (gx + gy > 14) strongEdges++
    }
  }
  const strongEdgeFrac = count > 0 ? strongEdges / count : 0

  // Documentos con texto: gradiente medio alto, varianza de luminancia notable,
  // y bastantes bordes fuertes. Fotos de pared/mesa/mano vacía suelen fallar aquí.
  const MIN_MEAN_GRADIENT = 9.0
  const MIN_LUMA_STD = 16.0
  const MIN_STRONG_EDGE_FRAC = 0.022

  if (meanGradient < MIN_MEAN_GRADIENT) {
    return {
      ok: false,
      message:
        'La imagen se ve muy borrosa o sin contraste. Acerca el albarán, más luz y enfoca antes de repetir la foto.',
    }
  }

  if (lumaStd < MIN_LUMA_STD) {
    return {
      ok: false,
      message:
        'La imagen es demasiado uniforme (casi sin detalle). Asegúrate de encuadrar el papel del albarán con texto legible.',
    }
  }

  if (strongEdgeFrac < MIN_STRONG_EDGE_FRAC) {
    return {
      ok: false,
      message:
        'No se detecta suficiente texto o líneas de albarán. Repite la foto encuadrando el documento completo.',
    }
  }

  return { ok: true, message: 'Imagen aceptable' }
}
