import 'server-only'

import sharp from 'sharp'
import { PRODUCT_PHOTO_HEIGHT, PRODUCT_PHOTO_WIDTH } from '@/lib/carta-product-photo'

const MAX_INPUT_BYTES = 10 * 1024 * 1024

/** Umbral trim: recorta bordes casi blancos (fondo estudio). */
const TRIM_THRESHOLD = 20

/** Lienzo 4:5 transparente: el marco de carta ya es blanco; la vajilla no debe heredar un rectángulo. */
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 as const }

export function isAllowedPhotoMime(mime: string): boolean {
  return mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp' || mime === 'image/gif'
}

/**
 * Trim de márgenes blancos + encajar entero en 1200×1500 (sin recortar el producto).
 * El relleno del lienzo es transparente para que el configurador de Plat Marbella
 * no reciba un bloque blanco alrededor del alimento.
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
      background: TRANSPARENT,
      withoutEnlargement: false,
    })
    .webp({ quality: 85, effort: 4, alphaQuality: 80 })
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
