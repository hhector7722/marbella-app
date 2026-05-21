import { cartaShowsProductPhoto } from '@/lib/carta-product-photo'
import { uniqueCartaCoverUrls } from '@/lib/carta-cover-preload'

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
