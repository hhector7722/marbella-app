import { cn } from '@/lib/utils'

/** Proporciones de lienzo normalizado (servidor) y presentación en carta (cliente). */
export const PRODUCT_PHOTO_WIDTH = 1200
export const PRODUCT_PHOTO_HEIGHT = 1500

export type CartaPhotoScale = 's' | 'm' | 'l'

/** Factor visual (transform). S = antiguo M; M = mitad entre antiguo M y L. */
const FOOD_SCALE_FACTOR: Record<CartaPhotoScale, number> = {
  s: 0.72,
  m: 0.86,
  l: 1,
}

const DRINK_SCALE_FACTOR: Record<CartaPhotoScale, number> = {
  s: 0.65,
  m: 0.785,
  l: 0.92,
}

const COVER_SCALE_FACTOR: Record<CartaPhotoScale, number> = {
  s: 0.8,
  m: 0.9,
  l: 1,
}

/** Factor visual absoluto por artículo (solo imagen; el marco de fila sigue la talla S/M/L de BD). */
const CARTA_PHOTO_ARTICULO_FACTOR_OVERRIDE: Readonly<Record<number, number>> = {
  61: 0.48, // OLIVES FARCIDES — más pequeño que S global
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

/** Mismo ancho que 1/3 del grid de carta: evita que fotos crezcan en filas de 1–2 ítems. */
export const CARTA_PRODUCT_PHOTO_CELL_MAX_WIDTH_CLASS = 'mx-auto w-full max-w-[7.75rem]'

/** Ancho por celda en filas de 2 (equivalente a 3 celdas de 7.75rem repartidas en 2). */
export const CARTA_PRODUCT_PHOTO_CELL_MAX_WIDTH_2COL_CLASS =
  'mx-auto w-full max-w-[11.625rem]'

export function getCartaProductPhotoCellMaxWidthClass(itemsInRow: number): string {
  if (itemsInRow === 2) return CARTA_PRODUCT_PHOTO_CELL_MAX_WIDTH_2COL_CLASS
  return CARTA_PRODUCT_PHOTO_CELL_MAX_WIDTH_CLASS
}

/** Fila Plato Marbella: el bloque de 1–3 productos queda centrado en el modal. */
export function getPlatoMarbellaProductRowGridClass(
  itemCount: number,
  itemsAlign: 'start' | 'stretch' = 'start'
): string {
  const n = Math.min(3, Math.max(1, itemCount))
  const align = itemsAlign === 'stretch' ? 'items-stretch' : 'items-start'
  return cn(
    'grid gap-x-2 gap-y-0 sm:gap-x-2.5',
    align,
    n === 3 ? 'w-full grid-cols-3' : n === 2 ? 'w-fit grid-cols-2' : 'w-fit grid-cols-1'
  )
}

export const PLATO_MARBELLA_PRODUCT_ROW_CENTER_CLASS = 'flex w-full justify-center'

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

export const CARTA_PARENTS_WITH_PRODUCT_PHOTOS = [
  'Tapas',
  'Bocadillos',
  'Platos',
  'Bebidas',
  'Cafetería',
  'Extras',
  'Snacks',
  'Menús',
  'Helados',
] as const

export function normalizeCartaPhotoScale(
  value: string | null | undefined
): CartaPhotoScale {
  const v = (value ?? 'm').trim().toLowerCase()
  if (v === 's' || v === 'l') return v
  return 'm'
}

export function getCartaProductPhotoScaleFactor(
  scale: CartaPhotoScale | string | null | undefined,
  isDrink: boolean,
  articuloId?: number | null
): number {
  if (articuloId != null) {
    const fixed = CARTA_PHOTO_ARTICULO_FACTOR_OVERRIDE[articuloId]
    if (fixed != null) return fixed
  }
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

/** Grid con foto si hay URL o si la sección usa fotos por defecto (aunque aún no tenga imagen). */
export function cartaShowsProductPhoto(
  parentName: string | null | undefined,
  photoUrl?: string | null
): boolean {
  if (String(photoUrl ?? '').trim() !== '') return true
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
    (r) =>
      cartaShowsProductPhoto(r.category_parent_name, r.photo_url) &&
      String(r.photo_url ?? '').trim() !== ''
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

/** Factor de marco compartido por fila del grid: el máximo de la fila para alinear nombre/precio. */
export function getCartaProductGridRowPhotoSlotFactor(
  rows: Array<{
    photo_url?: string | null
    carta_photo_scale?: string | null
  }>,
  isDrink: boolean
): number {
  let maxF = 0
  for (const r of rows) {
    if (String(r.photo_url ?? '').trim() === '') continue
    const f = getCartaProductPhotoScaleFactor(r.carta_photo_scale, isDrink)
    if (f > maxF) maxF = f
  }
  if (maxF <= 0) return getCartaProductPhotoScaleFactor('m', isDrink)
  return maxF
}

/** Estilo de marco idéntico en las 3 celdas de una fila; la foto individual sigue escalando dentro (centrada). */
export function getCartaProductGridRowFrameStyle(
  rows: Array<{
    photo_url?: string | null
    carta_photo_scale?: string | null
  }>,
  isDrink: boolean
): ReturnType<typeof getCartaProductPhotoFrameStyle> {
  return getCartaProductPhotoFrameStyle(
    isDrink,
    getCartaProductGridRowPhotoSlotFactor(rows, isDrink)
  )
}
