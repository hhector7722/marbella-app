import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeCartaPhotoScale, type CartaPhotoScale } from '@/lib/carta-product-photo'

function ntrim(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s || null
}

type CategoryCoverRow = { id: string; cover_articulo_id: number | null }

export type MenuCategoryCoverResolved = {
  url: string | null
  scale: CartaPhotoScale
}

/**
 * Resuelve URL y talla S/M/L de portada por categoría (padre o hijo) desde cover_articulo_id.
 */
export async function resolveMenuCategoryCoverById(
  supabase: SupabaseClient,
  categories: CategoryCoverRow[]
): Promise<Record<string, MenuCategoryCoverResolved>> {
  const out: Record<string, MenuCategoryCoverResolved> = {}
  for (const c of categories) {
    out[c.id] = { url: null, scale: 'm' }
  }

  const coverIds = [
    ...new Set(categories.map((c) => c.cover_articulo_id).filter((x): x is number => x != null)),
  ]
  if (!coverIds.length) return out

  const coverByArticulo = new Map<number, MenuCategoryCoverResolved>()

  const { data: covMaps, error: covErr } = await supabase
    .from('map_tpv_receta')
    .select('articulo_id, recipes(photo_url)')
    .in('articulo_id', coverIds)
  if (covErr) throw covErr

  const { data: covOvs, error: covOvsErr } = await supabase
    .from('digital_menu_overrides')
    .select('articulo_id, override_photo_url, carta_photo_scale')
    .in('articulo_id', coverIds)
  if (covOvsErr) throw covOvsErr

  const ovPhoto = new Map<number, string | null>()
  const ovScale = new Map<number, CartaPhotoScale>()
  for (const r of covOvs ?? []) {
    const row = r as {
      articulo_id: number
      override_photo_url?: string | null
      carta_photo_scale?: string | null
    }
    ovPhoto.set(row.articulo_id, ntrim(row.override_photo_url))
    ovScale.set(row.articulo_id, normalizeCartaPhotoScale(row.carta_photo_scale))
  }
  for (const r of covMaps ?? []) {
    const rec0 = (r as { recipes?: { photo_url?: string | null } | { photo_url?: string | null }[] }).recipes
    const rec = Array.isArray(rec0) ? rec0[0] : rec0
    const ph = ntrim(rec?.photo_url ?? null)
    const aid = (r as { articulo_id: number }).articulo_id
    const ovr = ovPhoto.get(aid) ?? null
    coverByArticulo.set(aid, {
      url: ovr ?? ph,
      scale: ovScale.get(aid) ?? 'm',
    })
  }

  for (const c of categories) {
    if (!c.cover_articulo_id) continue
    out[c.id] = coverByArticulo.get(c.cover_articulo_id) ?? { url: null, scale: 'm' }
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
