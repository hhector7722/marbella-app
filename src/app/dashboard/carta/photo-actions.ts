'use server'

import { createClient } from '@/utils/supabase/server'
import { canEditCartaMenu } from '@/lib/carta-permissions'
import { normalizeProductPhotoFile } from '@/lib/server/normalize-product-photo'

async function requirePhotoUploader() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) return { ok: false as const, error: 'No autorizado' }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) return { ok: false as const, error: profileError.message }

  const role = (profile?.role ?? null) as string | null
  if (canEditCartaMenu(role)) return { ok: true as const, supabase }

  const { data: editor, error: editorError } = await supabase
    .from('carta_editors')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (editorError) return { ok: false as const, error: editorError.message }
  if (!canEditCartaMenu(role, Boolean(editor))) {
    return { ok: false as const, error: 'Sin permisos para subir imágenes' }
  }

  return { ok: true as const, supabase }
}

function slugifyBase(name: string, fallback: string): string {
  return (
    name
      .toLowerCase()
      .replace(/\.[^/.]+$/, '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || fallback
  )
}

export async function uploadNormalizedRecipePhoto(
  formData: FormData
): Promise<{ success: true; publicUrl: string } | { success: false; error: string }> {
  const auth = await requirePhotoUploader()
  if (!auth.ok) return { success: false, error: auth.error }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return { success: false, error: 'No se recibió ninguna imagen.' }
  }

  try {
    const webp = await normalizeProductPhotoFile(file)
    const base = slugifyBase(file.name, 'receta')
    const storagePath = `${Date.now()}-${base}.webp`

    const { error: upErr } = await auth.supabase.storage
      .from('recipes')
      .upload(storagePath, webp, { contentType: 'image/webp', upsert: true })

    if (upErr) return { success: false, error: upErr.message }

    const { data } = auth.supabase.storage.from('recipes').getPublicUrl(storagePath)
    const publicUrl = data?.publicUrl
    if (!publicUrl) return { success: false, error: 'No se pudo obtener la URL pública.' }

    return { success: true, publicUrl }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'No se pudo procesar la imagen'
    return { success: false, error: msg }
  }
}

export async function uploadNormalizedCartaItemPhoto(
  formData: FormData
): Promise<{ success: true; publicUrl: string } | { success: false; error: string }> {
  const auth = await requirePhotoUploader()
  if (!auth.ok) return { success: false, error: auth.error }

  const file = formData.get('file')
  const articuloIdRaw = formData.get('articulo_id')
  const articuloId = Number(articuloIdRaw)

  if (!(file instanceof File)) {
    return { success: false, error: 'No se recibió ninguna imagen.' }
  }
  if (!Number.isFinite(articuloId) || articuloId <= 0) {
    return { success: false, error: 'Artículo no válido.' }
  }

  try {
    const webp = await normalizeProductPhotoFile(file)
    const base = slugifyBase(file.name, 'carta')
    const storagePath = `menu-items/${articuloId}/${Date.now()}-${base}.webp`

    const { error: upErr } = await auth.supabase.storage
      .from('carta_items')
      .upload(storagePath, webp, { contentType: 'image/webp', upsert: true })

    if (upErr) {
      const msg = upErr.message ?? ''
      if (msg.toLowerCase().includes('bucket') && msg.toLowerCase().includes('not found')) {
        return {
          success: false,
          error:
            "No existe el bucket 'carta_items' en Storage. Ejecuta las migraciones de Supabase o créalo manualmente.",
        }
      }
      return { success: false, error: upErr.message }
    }

    const { data } = auth.supabase.storage.from('carta_items').getPublicUrl(storagePath)
    const publicUrl = data?.publicUrl
    if (!publicUrl) return { success: false, error: 'No se pudo obtener la URL pública.' }

    return { success: true, publicUrl }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'No se pudo procesar la imagen'
    return { success: false, error: msg }
  }
}

export async function uploadNormalizedCategoryCoverPhoto(
  formData: FormData
): Promise<{ success: true; publicUrl: string } | { success: false; error: string }> {
  const auth = await requirePhotoUploader()
  if (!auth.ok) return { success: false, error: auth.error }

  const file = formData.get('file')
  const categoryIdRaw = formData.get('category_id')
  const categoryId = typeof categoryIdRaw === 'string' ? categoryIdRaw.trim() : ''

  if (!(file instanceof File)) {
    return { success: false, error: 'No se recibió ninguna imagen.' }
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(categoryId)) {
    return { success: false, error: 'Categoría no válida.' }
  }

  try {
    const webp = await normalizeProductPhotoFile(file)
    const base = slugifyBase(file.name, 'portada')
    const storagePath = `category-covers/${categoryId}/${Date.now()}-${base}.webp`

    const { error: upErr } = await auth.supabase.storage
      .from('carta_items')
      .upload(storagePath, webp, { contentType: 'image/webp', upsert: true })

    if (upErr) {
      const msg = upErr.message ?? ''
      if (msg.toLowerCase().includes('bucket') && msg.toLowerCase().includes('not found')) {
        return {
          success: false,
          error:
            "No existe el bucket 'carta_items' en Storage. Ejecuta las migraciones de Supabase o créalo manualmente.",
        }
      }
      return { success: false, error: upErr.message }
    }

    const { data } = auth.supabase.storage.from('carta_items').getPublicUrl(storagePath)
    const publicUrl = data?.publicUrl
    if (!publicUrl) return { success: false, error: 'No se pudo obtener la URL pública.' }

    return { success: true, publicUrl }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'No se pudo procesar la imagen'
    return { success: false, error: msg }
  }
}
