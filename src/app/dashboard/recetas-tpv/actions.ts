'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

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

export async function upsertMapping(
  articulo_id: number,
  recipe_id: string,
  factor_porcion: number
) {
  const gate = await requireManager()
  if (!gate.ok) return { success: false, error: gate.error }

  const supabase = gate.supabase

  const { error } = await supabase
    .from('map_tpv_receta')
    .upsert(
      { articulo_id, recipe_id, factor_porcion },
      { onConflict: 'articulo_id', ignoreDuplicates: false }
    )

  if (error) {
    console.error('upsertMapping error:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/recetas-tpv')
  revalidatePath('/staff/carta')
  revalidatePath('/dashboard/carta')
  return { success: true as const }
}

export async function deleteMapping(articulo_id: number) {
  const gate = await requireManager()
  if (!gate.ok) return { success: false, error: gate.error }

  const supabase = gate.supabase

  const { error } = await supabase
    .from('map_tpv_receta')
    .delete()
    .eq('articulo_id', articulo_id)

  if (error) {
    console.error('deleteMapping error:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/recetas-tpv')
  return { success: true as const }
}

export async function deleteSupplierMappingByIdAction(mappingId: string) {
  const gate = await requireManager()
  if (!gate.ok) return { success: false, error: gate.error }

  const id = String(mappingId ?? '').trim()
  if (!id) return { success: false, error: 'Falta el identificador del mapeo.' }

  const { error } = await gate.supabase.from('supplier_item_mappings').delete().eq('id', id)

  if (error) {
    console.error('deleteSupplierMappingByIdAction:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/recetas-tpv')
  revalidatePath('/dashboard/albaranes')
  return { success: true as const }
}

export async function upsertSupplierMappingForIngredientAction(params: {
  supplier_id: number
  supplier_item_name: string
  ingredient_id: string
  conversion_factor?: number
}) {
  const gate = await requireManager()
  if (!gate.ok) return { success: false, error: gate.error }

  const sid = Number(params.supplier_id)
  if (!Number.isFinite(sid) || sid <= 0) return { success: false, error: 'Proveedor inválido.' }

  const nm = String(params.supplier_item_name ?? '').trim()
  if (!nm) return { success: false, error: 'Indica el texto del albarán.' }

  const iid = String(params.ingredient_id ?? '').trim()
  if (!iid) return { success: false, error: 'Ingrediente inválido.' }

  const cf = Number(params.conversion_factor ?? 1)
  if (!Number.isFinite(cf) || cf <= 0) return { success: false, error: 'Factor de conversión inválido.' }

  const { error } = await gate.supabase.from('supplier_item_mappings').upsert(
    {
      supplier_id: sid,
      supplier_item_name: nm,
      ingredient_id: iid,
      conversion_factor: cf,
    },
    { onConflict: 'supplier_id,supplier_item_name', ignoreDuplicates: false }
  )

  if (error) {
    console.error('upsertSupplierMappingForIngredientAction:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/recetas-tpv')
  revalidatePath('/dashboard/albaranes')
  revalidatePath('/recipes')
  return { success: true as const }
}

export async function addRecipeIngredientLineAction(params: {
  recipe_id: string
  ingredient_id: string
  unit?: string
}) {
  const gate = await requireManager()
  if (!gate.ok) return { success: false, error: gate.error }

  const rid = String(params.recipe_id ?? '').trim()
  const iid = String(params.ingredient_id ?? '').trim()
  if (!rid || !iid) return { success: false, error: 'Receta o ingrediente inválidos.' }

  const unitDb = String(params.unit ?? 'kg').trim() || 'kg'

  const { data: dup, error: dupErr } = await gate.supabase
    .from('recipe_ingredients')
    .select('id')
    .eq('recipe_id', rid)
    .eq('ingredient_id', iid)
    .maybeSingle()

  if (dupErr) {
    console.error('addRecipeIngredientLineAction dup:', dupErr)
    return { success: false, error: dupErr.message }
  }
  if (dup) return { success: false, error: 'Ese ingrediente ya está en el escandallo de esta receta.' }

  const { error } = await gate.supabase.from('recipe_ingredients').insert({
    recipe_id: rid,
    ingredient_id: iid,
    quantity_gross: 1,
    quantity_half: 0.5,
    unit: unitDb,
  })

  if (error) {
    console.error('addRecipeIngredientLineAction:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/recetas-tpv')
  revalidatePath('/recipes')
  return { success: true as const }
}

export async function deleteRecipeIngredientLineAction(params: { recipe_id: string; ingredient_id: string }) {
  const gate = await requireManager()
  if (!gate.ok) return { success: false, error: gate.error }

  const rid = String(params.recipe_id ?? '').trim()
  const iid = String(params.ingredient_id ?? '').trim()
  if (!rid || !iid) return { success: false, error: 'Receta o ingrediente inválidos.' }

  const { error } = await gate.supabase
    .from('recipe_ingredients')
    .delete()
    .eq('recipe_id', rid)
    .eq('ingredient_id', iid)

  if (error) {
    console.error('deleteRecipeIngredientLineAction:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/recetas-tpv')
  revalidatePath('/recipes')
  return { success: true as const }
}

export async function deleteSupplierMappingCompositeAction(params: {
  supplier_id: number
  supplier_item_name: string
  ingredient_id: string
}) {
  const gate = await requireManager()
  if (!gate.ok) return { success: false, error: gate.error }

  const sid = Number(params.supplier_id)
  if (!Number.isFinite(sid)) return { success: false, error: 'Proveedor inválido.' }

  const nm = String(params.supplier_item_name ?? '').trim()
  const iid = String(params.ingredient_id ?? '').trim()
  if (!nm || !iid) return { success: false, error: 'Datos incompletos.' }

  const { error } = await gate.supabase
    .from('supplier_item_mappings')
    .delete()
    .eq('supplier_id', sid)
    .eq('supplier_item_name', nm)
    .eq('ingredient_id', iid)

  if (error) {
    console.error('deleteSupplierMappingCompositeAction:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/recetas-tpv')
  revalidatePath('/dashboard/albaranes')
  return { success: true as const }
}

