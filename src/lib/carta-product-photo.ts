/** Proporciones de lienzo normalizado (servidor) y presentación en carta (cliente). */
export const PRODUCT_PHOTO_WIDTH = 1200
export const PRODUCT_PHOTO_HEIGHT = 1500

export type CartaPhotoScale = 's' | 'm' | 'l'

const IMG_BASE =
  'pointer-events-none h-auto w-auto max-h-full max-w-full origin-center object-contain object-center'

/** Escala visual con transform (más fiable que max-h % dentro del marco flex). */
const FOOD_SCALE_CLASS: Record<CartaPhotoScale, string> = {
  s: `${IMG_BASE} scale-[0.52]`,
  m: `${IMG_BASE} scale-[0.78]`,
  l: `${IMG_BASE} scale-[1]`,
}

const DRINK_SCALE_CLASS: Record<CartaPhotoScale, string> = {
  s: `${IMG_BASE} scale-[0.48]`,
  m: `${IMG_BASE} scale-[0.72]`,
  l: `${IMG_BASE} scale-[0.94]`,
}

const COVER_SCALE_CLASS: Record<CartaPhotoScale, string> = {
  s: 'max-h-full max-w-full origin-center object-contain object-center scale-[0.62]',
  m: 'h-full w-full object-contain object-center scale-[0.82]',
  l: 'max-h-full max-w-full origin-center object-contain object-center scale-[1]',
}

/** @deprecated Usar getCartaProductPhotoImgClass */
export const CARTA_PRODUCT_PHOTO_IMG_CLASS = FOOD_SCALE_CLASS.m

/** @deprecated Usar getCartaProductPhotoImgClass */
export const CARTA_PRODUCT_PHOTO_IMG_DRINK_CLASS = DRINK_SCALE_CLASS.m

/** Altura explícita: el grid reserva fila; sin aspect-ratio que colapse con img grande. */
export const CARTA_DRINK_PHOTO_FRAME_CLASS =
  'relative mx-auto flex h-[min(26vw,96px)] w-full shrink-0 items-center justify-center overflow-hidden bg-white'

export const CARTA_DEFAULT_PHOTO_FRAME_CLASS =
  'relative mx-auto flex aspect-[4/5] w-full shrink-0 items-center justify-center overflow-hidden bg-white'

export const CARTA_PARENTS_WITH_PRODUCT_PHOTOS = ['Tapas', 'Bocadillos', 'Platos', 'Bebidas'] as const

export function normalizeCartaPhotoScale(
  value: string | null | undefined
): CartaPhotoScale {
  const v = (value ?? 'm').trim().toLowerCase()
  if (v === 's' || v === 'l') return v
  return 'm'
}

export function getCartaProductPhotoImgClass(
  scale: CartaPhotoScale | string | null | undefined,
  isDrink: boolean
): string {
  const s = normalizeCartaPhotoScale(scale)
  return isDrink ? DRINK_SCALE_CLASS[s] : FOOD_SCALE_CLASS[s]
}

export function getCartaCoverPhotoImgClass(
  scale: CartaPhotoScale | string | null | undefined
): string {
  return COVER_SCALE_CLASS[normalizeCartaPhotoScale(scale)]
}

export function isCartaDrinksSection(parentName: string | null | undefined): boolean {
  return (parentName?.trim() ?? '') === 'Bebidas'
}

export function cartaShowsProductPhoto(parentName: string | null | undefined): boolean {
  const n = parentName?.trim() ?? ''
  return (CARTA_PARENTS_WITH_PRODUCT_PHOTOS as readonly string[]).includes(n)
}
