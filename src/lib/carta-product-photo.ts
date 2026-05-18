/** Proporciones de lienzo normalizado (servidor) y presentación en carta (cliente). */
export const PRODUCT_PHOTO_WIDTH = 1200
export const PRODUCT_PHOTO_HEIGHT = 1500

export type CartaPhotoScale = 's' | 'm' | 'l'

/** Factor visual (transform) — diferencia clara entre tallas. */
const FOOD_SCALE_FACTOR: Record<CartaPhotoScale, number> = {
  s: 0.42,
  m: 0.72,
  l: 1,
}

const DRINK_SCALE_FACTOR: Record<CartaPhotoScale, number> = {
  s: 0.38,
  m: 0.65,
  l: 0.92,
}

const COVER_SCALE_FACTOR: Record<CartaPhotoScale, number> = {
  s: 0.58,
  m: 0.8,
  l: 1,
}

export const CARTA_PRODUCT_PHOTO_IMG_NEUTRAL_CLASS =
  'pointer-events-none h-auto w-auto max-h-full max-w-full origin-center object-contain object-center'

/** @deprecated Usar CartaMenuProductPhoto o getCartaProductPhotoScaleFactor */
export const CARTA_PRODUCT_PHOTO_IMG_CLASS = CARTA_PRODUCT_PHOTO_IMG_NEUTRAL_CLASS

/** @deprecated Usar CartaMenuProductPhoto o getCartaProductPhotoScaleFactor */
export const CARTA_PRODUCT_PHOTO_IMG_DRINK_CLASS = CARTA_PRODUCT_PHOTO_IMG_NEUTRAL_CLASS

/** Shell del marco foto; la altura / ratio la fija `getCartaProductPhotoFrameStyle` según escala. */
export const CARTA_PRODUCT_PHOTO_FRAME_SHELL_CLASS =
  'relative mx-auto flex w-full shrink-0 items-center justify-center overflow-hidden bg-white'

/** @deprecated Usar CARTA_PRODUCT_PHOTO_FRAME_SHELL_CLASS + getCartaProductPhotoFrameStyle */
export const CARTA_DRINK_PHOTO_FRAME_CLASS =
  `${CARTA_PRODUCT_PHOTO_FRAME_SHELL_CLASS} h-[min(26vw,96px)]`

/** @deprecated Usar CARTA_PRODUCT_PHOTO_FRAME_SHELL_CLASS + getCartaProductPhotoFrameStyle */
export const CARTA_DEFAULT_PHOTO_FRAME_CLASS =
  `${CARTA_PRODUCT_PHOTO_FRAME_SHELL_CLASS} aspect-[4/5]`

const DRINK_FRAME_BASE_VW = 26
const DRINK_FRAME_MAX_PX = 96

/** Ratio ancho/alto del marco comida para un factor de escala visual (corrige hueco tras `transform: scale`). */
export function getCartaFoodPhotoFrameAspectRatio(scaleFactor: number): number {
  const f = Math.min(1, Math.max(0.2, scaleFactor))
  return 4 / (5 * f)
}

export function getCartaProductPhotoFrameStyle(
  isDrink: boolean,
  scaleFactor: number
): { aspectRatio?: number; height?: string } {
  const f = Math.min(1, Math.max(0.2, scaleFactor))
  if (isDrink) {
    return {
      height: `calc(min(${DRINK_FRAME_BASE_VW}vw, ${DRINK_FRAME_MAX_PX}px) * ${f})`,
    }
  }
  return { aspectRatio: getCartaFoodPhotoFrameAspectRatio(f) }
}

export const CARTA_PARENTS_WITH_PRODUCT_PHOTOS = ['Tapas', 'Bocadillos', 'Platos', 'Bebidas'] as const

export function normalizeCartaPhotoScale(
  value: string | null | undefined
): CartaPhotoScale {
  const v = (value ?? 'm').trim().toLowerCase()
  if (v === 's' || v === 'l') return v
  return 'm'
}

export function getCartaProductPhotoScaleFactor(
  scale: CartaPhotoScale | string | null | undefined,
  isDrink: boolean
): number {
  const s = normalizeCartaPhotoScale(scale)
  return isDrink ? DRINK_SCALE_FACTOR[s] : FOOD_SCALE_FACTOR[s]
}

export function getCartaCoverPhotoScaleFactor(
  scale: CartaPhotoScale | string | null | undefined
): number {
  return COVER_SCALE_FACTOR[normalizeCartaPhotoScale(scale)]
}

/** @deprecated Usar getCartaProductPhotoScaleFactor + style transform */
export function getCartaProductPhotoImgClass(
  scale: CartaPhotoScale | string | null | undefined,
  isDrink: boolean
): string {
  return CARTA_PRODUCT_PHOTO_IMG_NEUTRAL_CLASS
}

/** @deprecated Usar getCartaCoverPhotoScaleFactor + style transform */
export function getCartaCoverPhotoImgClass(
  scale: CartaPhotoScale | string | null | undefined
): string {
  return 'h-full w-full object-contain object-center origin-center'
}

export function isCartaDrinksSection(parentName: string | null | undefined): boolean {
  return (parentName?.trim() ?? '') === 'Bebidas'
}

export function cartaShowsProductPhoto(parentName: string | null | undefined): boolean {
  const n = parentName?.trim() ?? ''
  return (CARTA_PARENTS_WITH_PRODUCT_PHOTOS as readonly string[]).includes(n)
}

export type CartaProductGridRowDensity = 'normal' | 'cozy' | 'compact'

/** Una “fila” del grid (p. ej. 3 celdas): compacta el layout si todas las fotos visibles son S, o si ninguna es L. */
export function cartaProductGridRowDensity(
  rows: Array<{
    photo_url?: string | null
    carta_photo_scale?: string | null
    category_parent_name?: string | null
  }>
): CartaProductGridRowDensity {
  const relevant = rows.filter(
    (r) => cartaShowsProductPhoto(r.category_parent_name) && String(r.photo_url ?? '').trim() !== ''
  )
  if (relevant.length === 0) return 'normal'
  const scales = relevant.map((r) => normalizeCartaPhotoScale(r.carta_photo_scale))
  if (scales.every((s) => s === 's')) return 'compact'
  if (scales.every((s) => s === 's' || s === 'm')) return 'cozy'
  return 'normal'
}

export function chunkCartaProductGridRows<T>(rows: T[], columns = 3): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += columns) {
    out.push(rows.slice(i, i + columns))
  }
  return out
}
