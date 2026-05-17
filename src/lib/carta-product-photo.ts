/** Proporciones de lienzo normalizado (servidor) y presentación en carta (cliente). */
export const PRODUCT_PHOTO_WIDTH = 1200
export const PRODUCT_PHOTO_HEIGHT = 1500

export type CartaPhotoScale = 's' | 'm' | 'l'

const IMG_BASE = 'pointer-events-none h-auto w-auto object-contain object-center'

/** Producto entero visible; altura visual acotada para parecerse entre tarjetas (talla M). */
export const CARTA_PRODUCT_PHOTO_IMG_CLASS =
  `${IMG_BASE} max-h-[90%] max-w-[94%]`

/** Bebidas: imagen contenida en marco de altura fija (talla M). */
export const CARTA_PRODUCT_PHOTO_IMG_DRINK_CLASS =
  `${IMG_BASE} max-h-full max-w-[80%]`

const FOOD_SCALE_CLASS: Record<CartaPhotoScale, string> = {
  s: `${IMG_BASE} max-h-[68%] max-w-[76%]`,
  m: CARTA_PRODUCT_PHOTO_IMG_CLASS,
  l: `${IMG_BASE} max-h-[98%] max-w-[98%]`,
}

const DRINK_SCALE_CLASS: Record<CartaPhotoScale, string> = {
  s: `${IMG_BASE} max-h-[72%] max-w-[68%]`,
  m: CARTA_PRODUCT_PHOTO_IMG_DRINK_CLASS,
  l: `${IMG_BASE} max-h-full max-w-[92%]`,
}

const COVER_SCALE_CLASS: Record<CartaPhotoScale, string> = {
  s: 'h-[78%] w-[78%] object-contain object-center',
  m: 'h-full w-full object-contain object-center',
  l: 'h-[95%] w-[95%] object-contain object-center',
}

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
