'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

/** Campos opcionales = solo se actualizan si van en el objeto (merge con fila existente). */
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

  const merged: OverrideRow = {
    articulo_id: input.articulo_id,
    is_hidden: 'is_hidden' in input ? Boolean(input.is_hidden) : (ex?.is_hidden ?? false),
    sort_order: 'sort_order' in input ? input.sort_order! : (ex?.sort_order ?? null),
    category_id: 'category_id' in input ? input.category_id! : (ex?.category_id ?? null),
    override_nombre: 'override_nombre' in input ? input.override_nombre! : (ex?.override_nombre ?? null),
    override_nombre_es: 'override_nombre_es' in input ? input.override_nombre_es! : (ex?.override_nombre_es ?? null),
    override_nombre_ca: 'override_nombre_ca' in input ? input.override_nombre_ca! : (ex?.override_nombre_ca ?? null),
    override_nombre_en: 'override_nombre_en' in input ? input.override_nombre_en! : (ex?.override_nombre_en ?? null),
    override_descripcion: 'override_descripcion' in input ? input.override_descripcion! : (ex?.override_descripcion ?? null),
    override_precio: 'override_precio' in input ? input.override_precio! : (ex?.override_precio ?? null),
    override_photo_url: 'override_photo_url' in input ? input.override_photo_url! : (ex?.override_photo_url ?? null),
  }

  const { error } = await supabase
    .from('digital_menu_overrides')
    .upsert(merged, { onConflict: 'articulo_id', ignoreDuplicates: false })

  if (error) {
    console.error('upsertMenuOverride error:', error)
    return { success: false as const, error: error.message }
  }

  revalidatePath('/dashboard/carta')
  revalidatePath('/staff/carta')
  return { success: true as const }
}

export async function setMenuSectionCoverArticulo(category_id: string, cover_articulo_id: number | null) {
  const gate = await requireManager()
  if (!gate.ok) return { success: false as const, error: gate.error }

  const supabase = gate.supabase

  const { data: cat, error: catErr } = await supabase
    .from('categories')
    .select('id, scope, parent_id')
    .eq('id', category_id)
    .maybeSingle()

  if (catErr) return { success: false as const, error: catErr.message }
  if (!cat || cat.scope !== 'menu' || cat.parent_id != null) {
    return { success: false as const, error: 'Categoría inválida (solo secciones padre del menú).' }
  }

  if (cover_articulo_id != null) {
    const { data: mapRow, error: mapErr } = await supabase
      .from('map_tpv_receta')
      .select('articulo_id')
      .eq('articulo_id', cover_articulo_id)
      .maybeSingle()
    if (mapErr) return { success: false as const, error: mapErr.message }
    if (!mapRow) {
      return { success: false as const, error: 'El artículo debe estar mapeado a receta en carta.' }
    }
  }

  const { error } = await supabase
    .from('categories')
    .update({ cover_articulo_id })
    .eq('id', category_id)
    .eq('scope', 'menu')
    .is('parent_id', null)

  if (error) {
    console.error('setMenuSectionCoverArticulo error:', error)
    return { success: false as const, error: error.message }
  }

  revalidatePath('/dashboard/carta')
  revalidatePath('/staff/carta')
  return { success: true as const }
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

