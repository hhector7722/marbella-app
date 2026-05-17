import 'server-only'

import sharp from 'sharp'

/** Carta / receta: proporción 4:5 en pantalla. */
export const PRODUCT_PHOTO_WIDTH = 1200
export const PRODUCT_PHOTO_HEIGHT = 1500

/** Altura del producto (tras trim) respecto al lienzo: todos “pesan” parecido en la rejilla. */
const CONTENT_HEIGHT_RATIO = 0.86

const MAX_INPUT_BYTES = 10 * 1024 * 1024

/** Umbral trim: recorta bordes casi blancos (fondo estudio). */
const TRIM_THRESHOLD = 20

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 as const }

export function isAllowedPhotoMime(mime: string): boolean {
  return mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp' || mime === 'image/gif'
}

/**
 * 1) Trim de márgenes blancos.
 * 2) Escala para que el producto ocupe ~86% del alto del lienzo (bocadillo ≈ hamburguesa en carta).
 * 3) Recorte horizontal centrado si sobra ancho; relleno blanco si falta.
 * 4) Lienzo fijo 1200×1500 WebP.
 */
export async function normalizeProductPhotoBuffer(input: Buffer): Promise<Buffer> {
  if (input.length > MAX_INPUT_BYTES) {
    throw new Error('La imagen es demasiado grande (máx. 10 MB).')
  }

  const rotated = await sharp(input, { failOn: 'none' }).rotate().toBuffer()

  let trimmed = rotated
  try {
    trimmed = await sharp(rotated).trim({ threshold: TRIM_THRESHOLD }).toBuffer()
  } catch {
    /* sin trim */
  }

  const meta = await sharp(trimmed).metadata()
  const w = meta.width ?? 0
  const h = meta.height ?? 0
  if (w < 1 || h < 1) {
    throw new Error('No se pudo leer la imagen.')
  }

  const contentH = Math.round(PRODUCT_PHOTO_HEIGHT * CONTENT_HEIGHT_RATIO)
  const scale = contentH / h
  let resizedW = Math.round(w * scale)

  let content = await sharp(trimmed)
    .resize(resizedW, contentH, { fit: 'fill' })
    .toBuffer()

  if (resizedW > PRODUCT_PHOTO_WIDTH) {
    const left = Math.round((resizedW - PRODUCT_PHOTO_WIDTH) / 2)
    content = await sharp(content)
      .extract({ left, top: 0, width: PRODUCT_PHOTO_WIDTH, height: contentH })
      .toBuffer()
    resizedW = PRODUCT_PHOTO_WIDTH
  }

  const padTop = Math.max(0, Math.floor((PRODUCT_PHOTO_HEIGHT - contentH) / 2))
  const padBottom = Math.max(0, PRODUCT_PHOTO_HEIGHT - contentH - padTop)
  const padLeft = Math.max(0, Math.floor((PRODUCT_PHOTO_WIDTH - resizedW) / 2))
  const padRight = Math.max(0, PRODUCT_PHOTO_WIDTH - resizedW - padLeft)

  return sharp(content)
    .extend({
      top: padTop,
      bottom: padBottom,
      left: padLeft,
      right: padRight,
      background: WHITE,
    })
    .webp({ quality: 85, effort: 4 })
    .toBuffer()
}

export async function normalizeProductPhotoFile(file: File): Promise<Buffer> {
  if (!isAllowedPhotoMime(file.type)) {
    throw new Error('Formato no válido. Usa JPG, PNG o WebP.')
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('La imagen es demasiado grande (máx. 10 MB).')
  }
  return normalizeProductPhotoBuffer(Buffer.from(await file.arrayBuffer()))
}
