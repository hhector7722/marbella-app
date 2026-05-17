/** Proporciones de lienzo normalizado (servidor) y presentación en carta (cliente). */
export const PRODUCT_PHOTO_WIDTH = 1200
export const PRODUCT_PHOTO_HEIGHT = 1500

/** Producto entero visible; altura visual acotada para parecerse entre tarjetas. */
export const CARTA_PRODUCT_PHOTO_IMG_CLASS =
  'pointer-events-none max-h-[90%] max-w-[94%] h-auto w-auto object-contain object-center'

/** Bebidas: imagen más contenida dentro del mismo grid (solo sección Bebidas). */
export const CARTA_PRODUCT_PHOTO_IMG_DRINK_CLASS =
  'pointer-events-none max-h-[68%] max-w-[76%] h-auto w-auto object-contain object-center'

export const CARTA_DRINK_PHOTO_FRAME_CLASS =
  'relative mx-auto flex aspect-[5/6] w-full max-h-[min(28vw,108px)] shrink-0 items-center justify-center bg-white'

export const CARTA_DEFAULT_PHOTO_FRAME_CLASS =
  'relative mx-auto flex aspect-[4/5] w-full shrink-0 items-center justify-center bg-white'

export const CARTA_PARENTS_WITH_PRODUCT_PHOTOS = ['Tapas', 'Bocadillos', 'Platos', 'Bebidas'] as const

export function isCartaDrinksSection(parentName: string | null | undefined): boolean {
  return (parentName?.trim() ?? '') === 'Bebidas'
}

export function cartaShowsProductPhoto(parentName: string | null | undefined): boolean {
  const n = parentName?.trim() ?? ''
  return (CARTA_PARENTS_WITH_PRODUCT_PHOTOS as readonly string[]).includes(n)
}
