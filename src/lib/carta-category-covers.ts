import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeCartaPhotoScale, type CartaPhotoScale } from '@/lib/carta-product-photo'

function ntrim(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s || null
}

type CategoryCoverRow = {
  id: string
  cover_articulo_id: number | null
  cover_photo_url?: string | null
  cover_photo_scale?: string | null
}

export type MenuCategoryCoverResolved = {
  url: string | null
  scale: CartaPhotoScale
}

/**
 * Resuelve URL y talla S/M/L de portada por categoría (padre o hijo).
 * Si existe `cover_photo_url`, prevalece sobre `cover_articulo_id`.
 */
export async function resolveMenuCategoryCoverById(
  supabase: SupabaseClient,
  categories: CategoryCoverRow[]
): Promise<Record<string, MenuCategoryCoverResolved>> {
  const out: Record<string, MenuCategoryCoverResolved> = {}
  for (const c of categories) {
    out[c.id] = { url: null, scale: 'm' }
  }

  for (const c of categories) {
    const cu = ntrim(c.cover_photo_url)
    if (cu) {
      out[c.id] = { url: cu, scale: normalizeCartaPhotoScale(c.cover_photo_scale) }
    }
  }

  const coverIds = [
    ...new Set(
      categories
        .filter((c) => !ntrim(c.cover_photo_url) && c.cover_articulo_id != null)
        .map((c) => c.cover_articulo_id)
        .filter((x): x is number => x != null)
    ),
  ]
  if (!coverIds.length) return out

  const coverByArticulo = new Map<number, MenuCategoryCoverResolved>()

  const { data: covMaps, error: covErr } = await supabase
    .from('map_tpv_receta')
    .select('articulo_id, recipes(photo_url)')
    .in('articulo_id', coverIds)
  if (covErr) throw covErr

  let covOvsRes = await supabase
    .from('digital_menu_overrides')
    .select('articulo_id, override_photo_url, carta_photo_scale')
    .in('articulo_id', coverIds)
  if (covOvsRes.error?.message?.includes('carta_photo_scale')) {
    covOvsRes = (await supabase
      .from('digital_menu_overrides')
      .select('articulo_id, override_photo_url')
      .in('articulo_id', coverIds)) as typeof covOvsRes
  }
  if (covOvsRes.error) throw covOvsRes.error
  const covOvs = covOvsRes.data

  const ovPhoto = new Map<number, string | null>()
  const ovScale = new Map<number, CartaPhotoScale>()
  for (const r of covOvs ?? []) {
    ovPhoto.set(r.articulo_id, ntrim(r.override_photo_url))
    ovScale.set(r.articulo_id, normalizeCartaPhotoScale(r.carta_photo_scale))
  }
  for (const r of covMaps ?? []) {
    const rec0 = (r as { recipes?: { photo_url?: string | null } | { photo_url?: string | null }[] }).recipes
    const rec = Array.isArray(rec0) ? rec0[0] : rec0
    const ph = ntrim(rec?.photo_url ?? null)
    const aid = (r as { articulo_id: number }).articulo_id
    const ovr = ovPhoto.get(aid) ?? null
    coverByArticulo.set(aid, {
      url: ovr ?? ph,
      scale: ovScale.get(aid) ?? ('m' as CartaPhotoScale),
    })
  }

  for (const c of categories) {
    if (ntrim(c.cover_photo_url)) continue
    if (!c.cover_articulo_id) continue
    out[c.id] = coverByArticulo.get(c.cover_articulo_id) ?? { url: null, scale: 'm' }
  }

  return out
}

/**
 * Portadas para `/carta` (anon): sin `map_tpv_receta` / `digital_menu_overrides`.
 * Usa `cover_photo_url` de categoría o la foto del artículo portada ya presente en la vista pública.
 */
export function resolveMenuCategoryCoverForPublicCarta(
  categories: CategoryCoverRow[],
  menuItems: {
    articulo_id: number
    photo_url?: string | null
    carta_photo_scale?: string | null
  }[]
): Record<string, MenuCategoryCoverResolved> {
  const photoByArticulo = new Map<number, MenuCategoryCoverResolved>()
  for (const item of menuItems) {
    const url = ntrim(item.photo_url)
    if (!url) continue
    photoByArticulo.set(item.articulo_id, {
      url,
      scale: normalizeCartaPhotoScale(item.carta_photo_scale),
    })
  }

  const out: Record<string, MenuCategoryCoverResolved> = {}
  for (const c of categories) {
    const cu = ntrim(c.cover_photo_url)
    if (cu) {
      out[c.id] = { url: cu, scale: normalizeCartaPhotoScale(c.cover_photo_scale) }
      continue
    }
    if (c.cover_articulo_id != null) {
      out[c.id] =
        photoByArticulo.get(c.cover_articulo_id) ?? { url: null, scale: 'm' as CartaPhotoScale }
      continue
    }
    out[c.id] = { url: null, scale: 'm' }
  }
  return out
}

/** Mapas separados para props existentes de la carta. */
export function splitMenuCategoryCovers(resolved: Record<string, MenuCategoryCoverResolved>): {
  categoryCoverById: Record<string, string | null>
  categoryCoverScaleById: Record<string, CartaPhotoScale>
} {
  const categoryCoverById: Record<string, string | null> = {}
  const categoryCoverScaleById: Record<string, CartaPhotoScale> = {}
  for (const [id, v] of Object.entries(resolved)) {
    categoryCoverById[id] = v.url
    categoryCoverScaleById[id] = v.scale
  }
  return { categoryCoverById, categoryCoverScaleById }
}
