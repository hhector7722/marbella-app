'use server'

import { createClient } from '@/utils/supabase/server'
import { normalizeProductPhotoFile } from '@/lib/server/normalize-product-photo'
import { canonicalBaseUnitForPurchaseUnit } from '@/lib/ingredient-units'

export type ManualPriceResult =
  | { ok: true; changed: boolean; currentPrice: number; purchaseUnit: string }
  | { ok: false; message: string }

export type IngredientCanonicalConfig = {
  currentPrice: number
  purchaseUnit: string
  baseUnit: string
  recipeUnit: string
  densityGPerMl: number | null
}

export type ManualPriceUnitResult =
  | {
      ok: true
      priceChanged: boolean
      unitChanged: boolean
      recipeUnitChanged: boolean
      densityChanged: boolean
      currentPrice: number
      purchaseUnit: string
      baseUnit: string
      recipeUnit: string
      densityGPerMl: number | null
    }
  | { ok: false; message: string }

export type IngredientCanonicalConfigResult =
  | ({ ok: true } & IngredientCanonicalConfig)
  | { ok: false; message: string }

export type ArchiveIngredientResult =
  | { ok: true; archivedAt: string | null }
  | { ok: false; message: string }

export type IngredientPhotoResult =
  | { ok: true; imageUrl: string }
  | { ok: false; message: string }

const INGREDIENT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function slugifyFileBase(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/\.[^/.]+$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'imagen'
}

function photoFailureMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : ''
  if (msg.startsWith('Formato no válido') || msg.startsWith('La imagen es demasiado grande')) {
    return msg
  }
  return 'No se ha podido guardar la imagen. Vuelve a intentarlo.'
}

const INGREDIENT_PHYSICAL_UNITS = new Set(['kg', 'g', 'l', 'ml', 'cl', 'ud'])

async function requireIngredientManager() {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) {
    return { ok: false as const, message: 'La sesión ha caducado. Vuelve a entrar.', supabase: null }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle()

  if (profileError || !profile || !['manager', 'admin'].includes(String(profile.role))) {
    return { ok: false as const, message: 'No tienes permiso para editar ingredientes.', supabase: null }
  }
  return { ok: true as const, supabase }
}

export async function getIngredientCanonicalConfigAction(
  ingredientId: string,
): Promise<IngredientCanonicalConfigResult> {
  const id = String(ingredientId ?? '').trim()
  if (!INGREDIENT_ID_RE.test(id)) return { ok: false, message: 'Ingrediente no válido.' }

  const gate = await requireIngredientManager()
  if (!gate.ok) return { ok: false, message: gate.message }

  const { data, error } = await gate.supabase
    .from('ingredients')
    .select('current_price,purchase_unit,base_unit,recipe_unit,density_g_per_ml')
    .eq('id', id)
    .maybeSingle()

  if (error || !data) return { ok: false, message: 'No se ha encontrado el ingrediente.' }

  return {
    ok: true,
    currentPrice: Number(data.current_price),
    purchaseUnit: String(data.purchase_unit ?? 'ud').trim().toLowerCase(),
    baseUnit: String(data.base_unit ?? '').trim().toLowerCase(),
    recipeUnit: String(data.recipe_unit ?? data.purchase_unit ?? 'ud').trim().toLowerCase(),
    densityGPerMl: data.density_g_per_ml == null ? null : Number(data.density_g_per_ml),
  }
}


export async function setIngredientPriceAndUnitAction(
  ingredientId: string,
  newPrice: number,
  newPurchaseUnit: string,
  newRecipeUnit?: string | null,
  newDensityGPerMl?: number | null,
): Promise<ManualPriceUnitResult> {
  const id = String(ingredientId ?? '').trim()
  const price = Number(newPrice)
  const purchaseUnit = String(newPurchaseUnit ?? '').trim().toLowerCase()
  const recipeUnit = String(newRecipeUnit ?? purchaseUnit).trim().toLowerCase()
  const density =
    newDensityGPerMl == null || String(newDensityGPerMl).trim() === ''
      ? null
      : Number(newDensityGPerMl)
  const baseUnit = canonicalBaseUnitForPurchaseUnit(purchaseUnit)

  if (!id || !Number.isFinite(price) || price <= 0) {
    return { ok: false, message: 'El precio debe ser mayor que cero.' }
  }
  if (!INGREDIENT_PHYSICAL_UNITS.has(purchaseUnit) || !baseUnit) {
    return { ok: false, message: 'Selecciona una unidad de compra válida.' }
  }
  if (!INGREDIENT_PHYSICAL_UNITS.has(recipeUnit)) {
    return { ok: false, message: 'Selecciona una unidad de receta válida.' }
  }
  if (density != null && (!Number.isFinite(density) || density <= 0)) {
    return { ok: false, message: 'La densidad debe ser mayor que cero o quedar vacía.' }
  }

  const gate = await requireIngredientManager()
  if (!gate.ok) return { ok: false, message: gate.message }

  const { data: existing, error: existingError } = await gate.supabase
    .from('ingredients')
    .select('current_price,purchase_unit,base_unit,recipe_unit,density_g_per_ml')
    .eq('id', id)
    .maybeSingle()

  if (existingError || !existing) {
    return { ok: false, message: 'No se ha encontrado el ingrediente.' }
  }

  const oldPrice = Number(existing.current_price)
  const oldPurchaseUnit = String(existing.purchase_unit ?? '').trim().toLowerCase()
  const oldBaseUnit = String(existing.base_unit ?? '').trim().toLowerCase()
  const oldRecipeUnit = String(existing.recipe_unit ?? oldPurchaseUnit).trim().toLowerCase()
  const oldDensity = existing.density_g_per_ml == null ? null : Number(existing.density_g_per_ml)

  const priceChanged = !Number.isFinite(oldPrice) || Math.abs(oldPrice - price) >= 1e-9
  const unitChanged = oldPurchaseUnit !== purchaseUnit || oldBaseUnit !== baseUnit
  const recipeUnitChanged = oldRecipeUnit !== recipeUnit
  const densityChanged =
    oldDensity == null || density == null
      ? oldDensity !== density
      : Math.abs(oldDensity - density) >= 1e-9

  if (unitChanged || recipeUnitChanged || densityChanged) {
    const { error: unitError } = await gate.supabase
      .from('ingredients')
      .update({
        purchase_unit: purchaseUnit,
        unit_type: purchaseUnit,
        base_unit: baseUnit,
        unit: baseUnit,
        recipe_unit: recipeUnit,
        density_g_per_ml: density,
      })
      .eq('id', id)

    if (unitError) {
      const frozen = String(unitError.message ?? '').includes('K2_DOMAIN_WRITE_FREEZE')
      return {
        ok: false,
        message: frozen
          ? 'Las unidades están temporalmente bloqueadas por una migración. Inténtalo de nuevo cuando termine.'
          : 'No se han podido guardar las unidades o la densidad del ingrediente.',
      }
    }
  }

  if (priceChanged) {
    const { data, error } = await gate.supabase.rpc('set_ingredient_current_price', {
      p_ingredient_id: id,
      p_new_price: price,
    })
    if (error) {
      return { ok: false, message: 'Las unidades se han guardado, pero no se ha podido guardar el precio.' }
    }
    const result = data as Record<string, unknown> | null
    if (!result || result.ok !== true) {
      return {
        ok: false,
        message: typeof result?.message === 'string' ? result.message : 'No se ha podido guardar el precio.',
      }
    }
  }

  return {
    ok: true,
    priceChanged,
    unitChanged,
    recipeUnitChanged,
    densityChanged,
    currentPrice: price,
    purchaseUnit,
    baseUnit,
    recipeUnit,
    densityGPerMl: density,
  }
}

export async function setIngredientCurrentPriceAction(
  ingredientId: string,
  newPrice: number,
): Promise<ManualPriceResult> {
  const id = String(ingredientId ?? '').trim()
  const price = Number(newPrice)

  if (!id || !Number.isFinite(price) || price <= 0) {
    return { ok: false, message: 'El precio debe ser mayor que cero.' }
  }

  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) {
    return { ok: false, message: 'La sesión ha caducado. Vuelve a entrar.' }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle()

  if (profileError || !profile || !['manager', 'admin'].includes(String(profile.role))) {
    return { ok: false, message: 'No tienes permiso para cambiar precios.' }
  }

  const { data, error } = await supabase.rpc('set_ingredient_current_price', {
    p_ingredient_id: id,
    p_new_price: price,
  })

  if (error) {
    return { ok: false, message: 'No se ha podido guardar el precio. Vuelve a intentarlo.' }
  }

  const result = data as Record<string, unknown> | null
  if (!result || result.ok !== true) {
    return {
      ok: false,
      message: typeof result?.message === 'string' ? result.message : 'No se ha podido guardar el precio.',
    }
  }

  return {
    ok: true,
    changed: result.changed === true,
    currentPrice: Number(result.current_price),
    purchaseUnit: String(result.purchase_unit ?? ''),
  }
}

export async function setIngredientArchivedAction(
  ingredientId: string,
  archived: boolean,
): Promise<ArchiveIngredientResult> {
  const id = String(ingredientId ?? '').trim()
  if (!id) {
    return { ok: false, message: 'Ingrediente no válido.' }
  }

  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) {
    return { ok: false, message: 'La sesión ha caducado. Vuelve a entrar.' }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle()

  if (profileError || !profile || !['manager', 'admin'].includes(String(profile.role))) {
    return { ok: false, message: 'No tienes permiso para archivar ingredientes.' }
  }

  const { data, error } = await supabase
    .from('ingredients')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', id)
    .select('archived_at')
    .maybeSingle()

  if (error || !data) {
    return { ok: false, message: 'No se ha podido archivar el ingrediente. Vuelve a intentarlo.' }
  }

  return { ok: true, archivedAt: (data.archived_at as string | null) ?? null }
}

export async function uploadIngredientPhotoAction(
  ingredientId: string,
  formData: FormData,
): Promise<IngredientPhotoResult> {
  const id = String(ingredientId ?? '').trim()
  if (!INGREDIENT_ID_RE.test(id)) {
    return { ok: false, message: 'Ingrediente no válido.' }
  }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size <= 0) {
    return { ok: false, message: 'No se recibió ninguna imagen.' }
  }

  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) {
    return { ok: false, message: 'La sesión ha caducado. Vuelve a entrar.' }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle()

  if (profileError || !profile || !['manager', 'admin'].includes(String(profile.role))) {
    return { ok: false, message: 'No tienes permiso para cambiar la imagen del ingrediente.' }
  }

  const { data: existing, error: existingError } = await supabase
    .from('ingredients')
    .select('id')
    .eq('id', id)
    .maybeSingle()

  if (existingError || !existing) {
    return { ok: false, message: 'No se ha encontrado el ingrediente.' }
  }

  let webp: Buffer
  try {
    webp = await normalizeProductPhotoFile(file)
  } catch (error: unknown) {
    return { ok: false, message: photoFailureMessage(error) }
  }

  const storagePath = `ingredient-images/${id}/${Date.now()}-${slugifyFileBase(file.name)}.webp`
  const { error: uploadError } = await supabase.storage
    .from('ingredients')
    .upload(storagePath, webp, { contentType: 'image/webp', upsert: false })

  if (uploadError) {
    return { ok: false, message: 'No se ha podido guardar la imagen. Vuelve a intentarlo.' }
  }

  const { data: publicData } = supabase.storage.from('ingredients').getPublicUrl(storagePath)
  const imageUrl = publicData?.publicUrl
  if (!imageUrl) {
    return { ok: false, message: 'No se ha podido guardar la imagen. Vuelve a intentarlo.' }
  }

  const { data: updated, error: updateError } = await supabase
    .from('ingredients')
    .update({ image_url: imageUrl })
    .eq('id', id)
    .select('image_url')
    .maybeSingle()

  if (updateError || !updated?.image_url) {
    return {
      ok: false,
      message: 'La imagen se subió, pero no se pudo guardar en el ingrediente.',
    }
  }

  return { ok: true, imageUrl: updated.image_url }
}
