'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { normalizeCartaPhotoScale, type CartaPhotoScale } from '@/lib/carta-product-photo'

/** Campos opcionales = solo se actualizan si van en el objeto (merge con fila existente). */
export type PlatoMarbellaSlotValue = 'entrante' | 'principal' | 'guarnicion'

export type MenuOverrideUpsertInput = {
  articulo_id: number
} & Partial<{
  is_hidden: boolean
  sort_order: number | null
  category_id: string | null
  override_nombre: string | null
  override_nombre_es: string | null
  override_nombre_ca: string | null
  override_nombre_en: string | null
  override_descripcion: string | null
  override_precio: number | null
  override_photo_url: string | null
  plato_marbella_slot: PlatoMarbellaSlotValue | null
  plato_marbella_is_menu_price: boolean
  plato_marbella_hide_name: boolean
  carta_photo_scale: CartaPhotoScale
  carta_dual_racion_enabled: boolean
  override_precio_medio: number | null
  carta_racion_entero_es: string | null
  carta_racion_entero_ca: string | null
  carta_racion_entero_en: string | null
  carta_racion_medio_es: string | null
  carta_racion_medio_ca: string | null
  carta_racion_medio_en: string | null
}>

async function requireManager() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) return { ok: false as const, supabase, error: 'Unauthorized' as const }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) return { ok: false as const, supabase, error: profileError.message }

  const role = (profile?.role ?? null) as string | null
  const allowed = role === 'manager' || role === 'admin' || role === 'supervisor'
  if (!allowed) return { ok: false as const, supabase, error: 'Forbidden' as const }

  return { ok: true as const, supabase }
}

type OverrideRow = {
  articulo_id: number
  is_hidden: boolean | null
  sort_order: number | null
  category_id: string | null
  override_nombre: string | null
  override_nombre_es: string | null
  override_nombre_ca: string | null
  override_nombre_en: string | null
  override_descripcion: string | null
  override_precio: number | null
  override_photo_url: string | null
  plato_marbella_slot: PlatoMarbellaSlotValue | null
  plato_marbella_is_menu_price: boolean
  plato_marbella_hide_name: boolean
  carta_photo_scale: CartaPhotoScale
  carta_dual_racion_enabled: boolean
  override_precio_medio: number | null
  carta_racion_entero_es: string | null
  carta_racion_entero_ca: string | null
  carta_racion_entero_en: string | null
  carta_racion_medio_es: string | null
  carta_racion_medio_ca: string | null
  carta_racion_medio_en: string | null
}

/** Un solo artículo con precio del menú por subcategoría Plato Marbella. */
export async function clearPlatoMarbellaMenuPriceExcept(
  category_id: string,
  keep_articulo_id: number
): Promise<{ success: true } | { success: false; error: string }> {
  const gate = await requireManager()
  if (!gate.ok) return { success: false, error: gate.error }

  const { error } = await gate.supabase
    .from('digital_menu_overrides')
    .update({ plato_marbella_is_menu_price: false })
    .eq('category_id', category_id)
    .neq('articulo_id', keep_articulo_id)

  if (error) {
    console.error('clearPlatoMarbellaMenuPriceExcept:', error)
    return { success: false, error: error.message }
  }
  return { success: true }
}

export async function upsertMenuOverride(input: MenuOverrideUpsertInput) {
  const gate = await requireManager()
  if (!gate.ok) return { success: false as const, error: gate.error }

  const supabase = gate.supabase

  const { data: existing, error: loadErr } = await supabase
    .from('digital_menu_overrides')
    .select('*')
    .eq('articulo_id', input.articulo_id)
    .maybeSingle()

  if (loadErr) {
    console.error('upsertMenuOverride load:', loadErr)
    return { success: false as const, error: loadErr.message }
  }

  const ex = existing as OverrideRow | null

  let nextSlot =
    'plato_marbella_slot' in input ? input.plato_marbella_slot! : (ex?.plato_marbella_slot ?? null)
  let nextMenuPrice =
    'plato_marbella_is_menu_price' in input
      ? Boolean(input.plato_marbella_is_menu_price)
      : (ex?.plato_marbella_is_menu_price ?? false)

  if (nextMenuPrice) nextSlot = null
  if (nextSlot) nextMenuPrice = false

  const mergedCategoryId =
    'category_id' in input ? input.category_id! : (ex?.category_id ?? null)

  if (nextMenuPrice && mergedCategoryId) {
    const cleared = await clearPlatoMarbellaMenuPriceExcept(mergedCategoryId, input.articulo_id)
    if (!cleared.success) return cleared
  }

  const merged: OverrideRow = {
    articulo_id: input.articulo_id,
    is_hidden: 'is_hidden' in input ? Boolean(input.is_hidden) : (ex?.is_hidden ?? false),
    sort_order: 'sort_order' in input ? input.sort_order! : (ex?.sort_order ?? null),
    category_id: mergedCategoryId,
    override_nombre: 'override_nombre' in input ? input.override_nombre! : (ex?.override_nombre ?? null),
    override_nombre_es: 'override_nombre_es' in input ? input.override_nombre_es! : (ex?.override_nombre_es ?? null),
    override_nombre_ca: 'override_nombre_ca' in input ? input.override_nombre_ca! : (ex?.override_nombre_ca ?? null),
    override_nombre_en: 'override_nombre_en' in input ? input.override_nombre_en! : (ex?.override_nombre_en ?? null),
    override_descripcion: 'override_descripcion' in input ? input.override_descripcion! : (ex?.override_descripcion ?? null),
    override_precio: 'override_precio' in input ? input.override_precio! : (ex?.override_precio ?? null),
    override_photo_url: 'override_photo_url' in input ? input.override_photo_url! : (ex?.override_photo_url ?? null),
    plato_marbella_slot: nextSlot,
    plato_marbella_is_menu_price: nextMenuPrice,
    plato_marbella_hide_name:
      'plato_marbella_hide_name' in input
        ? Boolean(input.plato_marbella_hide_name)
        : (ex?.plato_marbella_hide_name ?? false),
    carta_photo_scale:
      'carta_photo_scale' in input
        ? input.carta_photo_scale!
        : (ex?.carta_photo_scale === 's' || ex?.carta_photo_scale === 'l'
            ? ex.carta_photo_scale
            : 'm'),
    carta_dual_racion_enabled:
      'carta_dual_racion_enabled' in input
        ? Boolean(input.carta_dual_racion_enabled)
        : (ex?.carta_dual_racion_enabled ?? false),
    override_precio_medio:
      'override_precio_medio' in input ? input.override_precio_medio! : (ex?.override_precio_medio ?? null),
    carta_racion_entero_es:
      'carta_racion_entero_es' in input ? input.carta_racion_entero_es! : (ex?.carta_racion_entero_es ?? null),
    carta_racion_entero_ca:
      'carta_racion_entero_ca' in input ? input.carta_racion_entero_ca! : (ex?.carta_racion_entero_ca ?? null),
    carta_racion_entero_en:
      'carta_racion_entero_en' in input ? input.carta_racion_entero_en! : (ex?.carta_racion_entero_en ?? null),
    carta_racion_medio_es:
      'carta_racion_medio_es' in input ? input.carta_racion_medio_es! : (ex?.carta_racion_medio_es ?? null),
    carta_racion_medio_ca:
      'carta_racion_medio_ca' in input ? input.carta_racion_medio_ca! : (ex?.carta_racion_medio_ca ?? null),
    carta_racion_medio_en:
      'carta_racion_medio_en' in input ? input.carta_racion_medio_en! : (ex?.carta_racion_medio_en ?? null),
  }

  if (!merged.carta_dual_racion_enabled) {
    merged.override_precio_medio = null
    merged.carta_racion_entero_es = null
    merged.carta_racion_entero_ca = null
    merged.carta_racion_entero_en = null
    merged.carta_racion_medio_es = null
    merged.carta_racion_medio_ca = null
    merged.carta_racion_medio_en = null
  }

  let cartaPhotoScalePersisted = true
  let { error } = await supabase
    .from('digital_menu_overrides')
    .upsert(merged, { onConflict: 'articulo_id', ignoreDuplicates: false })

  if (error) {
    const msg = error.message ?? ''
    if (/carta_photo_scale/i.test(msg) && /does not exist|could not find the/i.test(msg)) {
      cartaPhotoScalePersisted = false
      const { carta_photo_scale: _drop, ...withoutScale } = merged
      ;({ error } = await supabase
        .from('digital_menu_overrides')
        .upsert(withoutScale, { onConflict: 'articulo_id', ignoreDuplicates: false }))
    } else if (/carta_dual_racion|override_precio_medio|carta_racion_|plato_marbella_hide_name/i.test(msg)) {
      const {
        carta_dual_racion_enabled: _d,
        override_precio_medio: _pm,
        carta_racion_entero_es: _ees,
        carta_racion_entero_ca: _eca,
        carta_racion_entero_en: _een,
        carta_racion_medio_es: _mes,
        carta_racion_medio_ca: _mca,
        carta_racion_medio_en: _men,
        plato_marbella_hide_name: _hn,
        ...withoutDual
      } = merged
      ;({ error } = await supabase
        .from('digital_menu_overrides')
        .upsert(withoutDual, { onConflict: 'articulo_id', ignoreDuplicates: false }))
    }
  }

  if (error) {
    console.error('upsertMenuOverride error:', error)
    return { success: false as const, error: error.message }
  }

  revalidatePath('/dashboard/carta')
  revalidatePath('/staff/carta')
  revalidatePath('/carta')
  return { success: true as const, carta_photo_scale_persisted: cartaPhotoScalePersisted }
}

export async function setMenuCategoryCover(input: {
  category_id: string
  cover_articulo_id: number | null
  cover_photo_url: string | null
  cover_photo_scale?: CartaPhotoScale | null
}): Promise<{ success: true } | { success: false; error: string }> {
  const gate = await requireManager()
  if (!gate.ok) return { success: false as const, error: gate.error }

  const supabase = gate.supabase

  const { data: cat, error: catErr } = await supabase
    .from('categories')
    .select('id, scope, parent_id')
    .eq('id', input.category_id)
    .maybeSingle()

  if (catErr) return { success: false as const, error: catErr.message }
  if (!cat || cat.scope !== 'menu') {
    return { success: false as const, error: 'Categoría inválida (solo categorías del menú).' }
  }

  const urlTrim = input.cover_photo_url?.trim() || null
  let nextArticulo = input.cover_articulo_id ?? null
  let nextUrl: string | null = urlTrim
  let nextScale: string | null = null

  if (nextUrl) {
    nextArticulo = null
    nextScale = normalizeCartaPhotoScale(input.cover_photo_scale ?? 'm')
  } else if (nextArticulo != null) {
    const { data: mapRow, error: mapErr } = await supabase
      .from('map_tpv_receta')
      .select('articulo_id')
      .eq('articulo_id', nextArticulo)
      .maybeSingle()
    if (mapErr) return { success: false as const, error: mapErr.message }
    if (!mapRow) {
      return { success: false as const, error: 'El artículo debe estar mapeado a receta en carta.' }
    }
    nextUrl = null
    nextScale = null
  } else {
    nextArticulo = null
    nextUrl = null
    nextScale = null
  }

  const payload = {
    cover_articulo_id: nextArticulo,
    cover_photo_url: nextUrl,
    cover_photo_scale: nextScale,
  }

  let { error } = await supabase
    .from('categories')
    .update(payload)
    .eq('id', input.category_id)
    .eq('scope', 'menu')

  if (
    error &&
    /cover_photo_url|cover_photo_scale/i.test(error.message) &&
    /does not exist|could not find the/i.test(error.message)
  ) {
    if (nextUrl) {
      return {
        success: false as const,
        error:
          'La base de datos no tiene columnas de portada libre. Aplica la migración 20260518140000_categories_cover_custom_photo.sql en Supabase.',
      }
    }
    const retry = await supabase
      .from('categories')
      .update({ cover_articulo_id: nextArticulo })
      .eq('id', input.category_id)
      .eq('scope', 'menu')
    error = retry.error
  }

  if (error) {
    console.error('setMenuCategoryCover error:', error)
    return { success: false as const, error: error.message }
  }

  revalidatePath('/dashboard/carta')
  revalidatePath('/staff/carta')
  return { success: true as const }
}

/** @deprecated Usar setMenuCategoryCover con cover_photo_url null */
export async function setMenuSectionCoverArticulo(category_id: string, cover_articulo_id: number | null) {
  return setMenuCategoryCover({
    category_id,
    cover_articulo_id,
    cover_photo_url: null,
    cover_photo_scale: null,
  })
}

export async function deleteMenuOverride(articulo_id: number) {
  const gate = await requireManager()
  if (!gate.ok) return { success: false as const, error: gate.error }

  const supabase = gate.supabase

  const { error } = await supabase.from('digital_menu_overrides').delete().eq('articulo_id', articulo_id)

  if (error) {
    console.error('deleteMenuOverride error:', error)
    return { success: false as const, error: error.message }
  }

  revalidatePath('/dashboard/carta')
  revalidatePath('/staff/carta')
  return { success: true as const }
}

export async function setArticuloDepartamento(articulo_id: number, departamento_id: number | null) {
  const gate = await requireManager()
  if (!gate.ok) return { success: false as const, error: gate.error }

  const supabase = gate.supabase

  const { error } = await supabase
    .from('bdp_articulos')
    .update({ departamento_id })
    .eq('id', articulo_id)

  if (error) {
    console.error('setArticuloDepartamento error:', error)
    return { success: false as const, error: error.message }
  }

  revalidatePath('/dashboard/carta')
  revalidatePath('/dashboard/recetas-tpv')
  revalidatePath('/staff/carta')
  return { success: true as const }
}

export type MenuCategoryOverrideUpsertInput = {
  category_id: string
} & Partial<{
  override_name_es: string | null
  override_name_ca: string | null
  override_name_en: string | null
}>

export async function upsertMenuCategoryOverride(input: MenuCategoryOverrideUpsertInput) {
  const gate = await requireManager()
  if (!gate.ok) return { success: false as const, error: gate.error }

  const supabase = gate.supabase

  const { data: cat, error: catErr } = await supabase
    .from('categories')
    .select('id, scope')
    .eq('id', input.category_id)
    .maybeSingle()

  if (catErr) return { success: false as const, error: catErr.message }
  if (!cat || cat.scope !== 'menu') return { success: false as const, error: 'Categoría inválida.' }

  const payload: Record<string, unknown> = { category_id: input.category_id }
  if ('override_name_es' in input) payload.override_name_es = input.override_name_es
  if ('override_name_ca' in input) payload.override_name_ca = input.override_name_ca
  if ('override_name_en' in input) payload.override_name_en = input.override_name_en

  const { error } = await supabase
    .from('menu_category_overrides')
    .upsert(payload, { onConflict: 'category_id', ignoreDuplicates: false })

  if (error) {
    console.error('upsertMenuCategoryOverride error:', error)
    return { success: false as const, error: error.message }
  }

  revalidatePath('/dashboard/carta')
  revalidatePath('/staff/carta')
  revalidatePath('/carta')
  return { success: true as const }
}

export type MenuCategorySortOrderInput = {
  category_id: string
  sort_order: number | null
}

export async function setMenuCategorySortOrders(input: MenuCategorySortOrderInput[]) {
  const gate = await requireManager()
  if (!gate.ok) return { success: false as const, error: gate.error }
  const supabase = gate.supabase

  for (const r of input) {
    if (r.sort_order == null) continue
    if (!Number.isFinite(r.sort_order) || r.sort_order < 0 || !Number.isInteger(r.sort_order)) {
      return { success: false as const, error: 'Orden inválido (categorías).' }
    }
  }

  for (const r of input) {
    const { error } = await supabase
      .from('categories')
      .update({ sort_order: r.sort_order })
      .eq('id', r.category_id)
      .eq('scope', 'menu')
    if (error) {
      console.error('setMenuCategorySortOrders error:', error)
      return { success: false as const, error: error.message }
    }
  }

  revalidatePath('/dashboard/carta')
  revalidatePath('/staff/carta')
  revalidatePath('/carta')
  return { success: true as const }
}

export type MenuItemSortOrderInput = {
  articulo_id: number
  sort_order: number | null
  category_id?: string | null
}

export async function setMenuItemSortOrders(input: MenuItemSortOrderInput[]) {
  const gate = await requireManager()
  if (!gate.ok) return { success: false as const, error: gate.error }
  const supabase = gate.supabase

  for (const r of input) {
    if (r.sort_order == null) continue
    if (!Number.isFinite(r.sort_order) || r.sort_order < 0 || !Number.isInteger(r.sort_order)) {
      return { success: false as const, error: 'Orden inválido (productos).' }
    }
  }

  const rows = input.map((r) => {
    const out: Record<string, unknown> = {
      articulo_id: r.articulo_id,
      sort_order: r.sort_order,
    }
    if ('category_id' in r) out.category_id = r.category_id ?? null
    return out
  })

  const { error } = await supabase
    .from('digital_menu_overrides')
    .upsert(rows, { onConflict: 'articulo_id', ignoreDuplicates: false })

  if (error) {
    console.error('setMenuItemSortOrders error:', error)
    return { success: false as const, error: error.message }
  }

  revalidatePath('/dashboard/carta')
  revalidatePath('/staff/carta')
  revalidatePath('/carta')
  return { success: true as const }
}

