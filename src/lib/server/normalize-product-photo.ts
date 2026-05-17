import 'server-only'

import sharp from 'sharp'
import { PRODUCT_PHOTO_HEIGHT, PRODUCT_PHOTO_WIDTH } from '@/lib/carta-product-photo'

const MAX_INPUT_BYTES = 10 * 1024 * 1024

/** Umbral trim: recorta bordes casi blancos (fondo estudio). */
const TRIM_THRESHOLD = 20

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 as const }

export function isAllowedPhotoMime(mime: string): boolean {
  return mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp' || mime === 'image/gif'
}

/**
 * Trim de márgenes blancos + encajar entero en 1200×1500 (sin recortar el producto).
 */
export async function normalizeProductPhotoBuffer(input: Buffer): Promise<Buffer> {
  if (input.length > MAX_INPUT_BYTES) {
    throw new Error('La imagen es demasiado grande (máx. 10 MB).')
  }

  const rotated = await sharp(input, { failOn: 'none' }).rotate().toBuffer()
  let pipeline = sharp(rotated)

  try {
    pipeline = sharp(await pipeline.trim({ threshold: TRIM_THRESHOLD }).toBuffer())
  } catch {
    pipeline = sharp(rotated)
  }

  return pipeline
    .resize(PRODUCT_PHOTO_WIDTH, PRODUCT_PHOTO_HEIGHT, {
      fit: 'contain',
      background: WHITE,
      withoutEnlargement: false,
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
