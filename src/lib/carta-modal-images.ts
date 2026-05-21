import { cartaShowsProductPhoto } from '@/lib/carta-product-photo'
import { uniqueCartaCoverUrls } from '@/lib/carta-cover-preload'
import type { PlatoMarbellaMenuRow } from '@/lib/carta-plato-marbella'

/** URLs de fotos de producto visibles en el grid de carta. */
export function collectCartaProductPhotoUrls(
  rows: Array<{ category_parent_name?: string | null; photo_url?: string | null }>
): string[] {
  const urls: (string | null | undefined)[] = []
  for (const row of rows) {
    if (cartaShowsProductPhoto(row.category_parent_name, row.photo_url)) {
      urls.push(row.photo_url)
    }
  }
  return uniqueCartaCoverUrls(urls)
}

/** Plato Marbella: solo URLs con foto real (precarga vía Image, no depende del tramo montado en DOM). */
export function collectPlatoMarbellaPhotoUrls(rows: PlatoMarbellaMenuRow[]): string[] {
  return uniqueCartaCoverUrls(rows.map((r) => r.photo_url))
}
