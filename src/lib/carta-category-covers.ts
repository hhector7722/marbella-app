import type { SupabaseClient } from '@supabase/supabase-js'

function ntrim(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s || null
}

type CategoryCoverRow = { id: string; cover_articulo_id: number | null }

/**
 * Resuelve URL de portada por categoría (padre o hijo) desde cover_articulo_id.
 */
export async function resolveMenuCategoryCoverById(
  supabase: SupabaseClient,
  categories: CategoryCoverRow[]
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {}
  for (const c of categories) {
    out[c.id] = null
  }

  const coverIds = [
    ...new Set(categories.map((c) => c.cover_articulo_id).filter((x): x is number => x != null)),
  ]
  if (!coverIds.length) return out

  const coverPhotoByArticulo = new Map<number, string | null>()

  const { data: covMaps, error: covErr } = await supabase
    .from('map_tpv_receta')
    .select('articulo_id, recipes(photo_url)')
    .in('articulo_id', coverIds)
  if (covErr) throw covErr

  const { data: covOvs, error: covOvsErr } = await supabase
    .from('digital_menu_overrides')
    .select('articulo_id, override_photo_url')
    .in('articulo_id', coverIds)
  if (covOvsErr) throw covOvsErr

  const ovPhoto = new Map<number, string | null>()
  for (const r of covOvs ?? []) {
    ovPhoto.set(r.articulo_id, ntrim((r as { override_photo_url?: string | null }).override_photo_url))
  }
  for (const r of covMaps ?? []) {
    const rec0 = (r as { recipes?: { photo_url?: string | null } | { photo_url?: string | null }[] }).recipes
    const rec = Array.isArray(rec0) ? rec0[0] : rec0
    const ph = ntrim(rec?.photo_url ?? null)
    const ovr = ovPhoto.get((r as { articulo_id: number }).articulo_id) ?? null
    coverPhotoByArticulo.set((r as { articulo_id: number }).articulo_id, ovr ?? ph)
  }

  for (const c of categories) {
    if (!c.cover_articulo_id) continue
    out[c.id] = coverPhotoByArticulo.get(c.cover_articulo_id) ?? null
  }

  return out
}
