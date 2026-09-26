'use server'

import { createClient } from '@/utils/supabase/server'
import { normalizeProductPhotoFile } from '@/lib/server/normalize-product-photo'

export type ManualPriceResult =
  | { ok: true; changed: boolean; currentPrice: number; purchaseUnit: string }
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
