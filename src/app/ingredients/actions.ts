'use server'

import { createClient } from '@/utils/supabase/server'
import { normalizeProductPhotoFile } from '@/lib/server/normalize-product-photo'

export type ManualPriceResult =
  | { ok: true; changed: boolean; currentPrice: number; purchaseUnit: string }
  | { ok: false; message: string }

export type ManualPriceUnitResult =
  | {
      ok: true
      priceChanged: boolean
      unitChanged: boolean
      recipeUnitChanged: boolean
      densityChanged: boolean
      currentPrice: number
      purchaseUnit: string
      recipeUnit: string
      densityGPerMl: number | null
      baseUnit: string
    }
  | { ok: false; message: string }

export type IngredientCanonicalConfigResult =
  | {
      ok: true
      ingredient: {
        id: string
        name: string
        currentPrice: number
        purchaseUnit: string
        recipeUnit: string
        densityGPerMl: number | null
        baseUnit: string
      }
    }
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

function canonicalUnit(value: string): 'kg' | 'g' | 'l' | 'ml' | 'cl' | 'ud' | null {
  const unit = String(value ?? '').trim().toLowerCase()
  if (unit === 'kg' || unit === 'g' || unit === 'l' || unit === 'ml' || unit === 'cl' || unit === 'ud') return unit
  return null
}

function unitDimension(unit: string): 'mass' | 'volume' | 'count' | null {
  const value = canonicalUnit(unit)
  if (value === 'kg' || value === 'g') return 'mass'
  if (value === 'l' || value === 'ml' || value === 'cl') return 'volume'
  if (value === 'ud') return 'count'
  return null
}

function canonicalBaseUnitForPurchaseUnit(unit: string): 'g' | 'ml' | 'ud' | null {
  const dimension = unitDimension(unit)
  if (dimension === 'mass') return 'g'
  if (dimension === 'volume') return 'ml'
  if (dimension === 'count') return 'ud'
  return null
}

export async function getIngredientCanonicalConfigAction(
  ingredientId: string,
): Promise<IngredientCanonicalConfigResult> {
  const id = String(ingredientId ?? '').trim()
  if (!INGREDIENT_ID_RE.test(id)) return { ok: false, message: 'Ingrediente no válido.' }

  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) return { ok: false, message: 'La sesión ha caducado. Vuelve a entrar.' }

  const { data, error } = await supabase
    .from('ingredients')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !data) return { ok: false, message: 'No se ha encontrado el ingrediente.' }
  const row = data as Record<string, unknown>
  const purchaseUnit = canonicalUnit(String(row.purchase_unit ?? '')) ?? 'ud'
  const recipeUnit = canonicalUnit(String(row.recipe_unit ?? '')) ?? purchaseUnit
  const densityRaw = Number(row.density_g_per_ml)

  return {
    ok: true,
    ingredient: {
      id,
      name: String(row.name ?? ''),
      currentPrice: Number(row.current_price) || 0,
      purchaseUnit,
      recipeUnit,
      densityGPerMl: Number.isFinite(densityRaw) && densityRaw > 0 ? densityRaw : null,
      baseUnit: String(row.base_unit ?? canonicalBaseUnitForPurchaseUnit(purchaseUnit) ?? ''),
    },
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
  const purchaseUnit = canonicalUnit(newPurchaseUnit)

  if (!id || !Number.isFinite(price) || price <= 0) {
    return { ok: false, message: 'El precio debe ser mayor que cero.' }
  }
  if (!purchaseUnit) return { ok: false, message: 'Selecciona una unidad de compra válida.' }

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
    return { ok: false, message: 'No tienes permiso para cambiar precio o unidades.' }
  }

  const { data: existing, error: existingError } = await supabase
    .from('ingredients')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (existingError || !existing) return { ok: false, message: 'No se ha encontrado el ingrediente.' }

  const row = existing as Record<string, unknown>
  const oldPrice = Number(row.current_price)
  const oldUnit = canonicalUnit(String(row.purchase_unit ?? '')) ?? 'ud'
  const oldRecipeUnit = canonicalUnit(String(row.recipe_unit ?? '')) ?? oldUnit
  const oldDensityRaw = Number(row.density_g_per_ml)
  const oldDensity = Number.isFinite(oldDensityRaw) && oldDensityRaw > 0 ? oldDensityRaw : null

  const recipeUnit = newRecipeUnit === undefined
    ? oldRecipeUnit
    : canonicalUnit(String(newRecipeUnit ?? ''))
  if (!recipeUnit) return { ok: false, message: 'Selecciona una unidad de receta válida.' }

  const densityCandidate = newDensityGPerMl === undefined
    ? oldDensity
    : (newDensityGPerMl == null ? null : Number(newDensityGPerMl))
  const density = densityCandidate != null && Number.isFinite(densityCandidate) && densityCandidate > 0
    ? densityCandidate
    : null

  const purchaseDimension = unitDimension(purchaseUnit)
  const recipeDimension = unitDimension(recipeUnit)
  const crossMassVolume =
    (purchaseDimension === 'mass' && recipeDimension === 'volume')
    || (purchaseDimension === 'volume' && recipeDimension === 'mass')

  if (purchaseDimension === 'count' && recipeDimension !== 'count') {
    return { ok: false, message: 'Para convertir unidades con masa o volumen usa una presentación por unidad, no densidad.' }
  }
  if (recipeDimension === 'count' && purchaseDimension !== 'count') {
    return { ok: false, message: 'Para convertir unidades con masa o volumen usa una presentación por unidad, no densidad.' }
  }
  if (crossMassVolume && density == null) {
    return { ok: false, message: 'Indica la densidad en g/ml para usar masa y volumen en el mismo ingrediente.' }
  }

  const baseUnit = canonicalBaseUnitForPurchaseUnit(purchaseUnit)
  if (!baseUnit) return { ok: false, message: 'No se pudo resolver la unidad base del ingrediente.' }

  const priceChanged = !Number.isFinite(oldPrice) || Math.abs(oldPrice - price) >= 1e-9
  const unitChanged = oldUnit !== purchaseUnit
  const recipeUnitChanged = oldRecipeUnit !== recipeUnit
  const densityChanged =
    (oldDensity == null) !== (density == null)
    || (oldDensity != null && density != null && Math.abs(oldDensity - density) >= 1e-9)
  const baseUnitChanged = String(row.base_unit ?? '') !== baseUnit || String(row.unit ?? '') !== baseUnit

  if (unitChanged || recipeUnitChanged || densityChanged || baseUnitChanged) {
    const { error: unitError } = await supabase
      .from('ingredients')
      .update({
        purchase_unit: purchaseUnit,
        unit_type: purchaseUnit,
        base_unit: baseUnit,
        unit: baseUnit,
        recipe_unit: recipeUnit,
        density_g_per_ml: density,
      } as never)
      .eq('id', id)
    if (unitError) {
      return { ok: false, message: 'No se han podido guardar las unidades físicas del ingrediente.' }
    }
  }

  if (priceChanged) {
    const { data, error } = await supabase.rpc('set_ingredient_current_price', {
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
    recipeUnit,
    densityGPerMl: density,
    baseUnit,
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
