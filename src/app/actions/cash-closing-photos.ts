'use server'

import { createClient } from '@/utils/supabase/server'

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

export type CashClosingPhotoKind = 'dataphone' | 'bdp-ticket'

async function requireAuthenticated() {
  const supabase = await createClient()
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()

  if (error || !session?.user) {
    return { ok: false as const, error: 'No autorizado' }
  }

  return { ok: true as const, supabase, userId: session.user.id }
}

function extForMime(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
}

function buildStoragePath(closingDate: string, closingId: string, kind: CashClosingPhotoKind, ext: string): string {
  const fileName = kind === 'dataphone' ? `dataphone.${ext}` : `bdp-ticket.${ext}`
  return `${closingDate}/${closingId}/${fileName}`
}

export async function uploadCashClosingPhotoAction(formData: FormData): Promise<
  { success: true; path: string } | { success: false; error: string }
> {
  const auth = await requireAuthenticated()
  if (!auth.ok) return { success: false, error: auth.error }

  const file = formData.get('file')
  const closingDateRaw = formData.get('closing_date')
  const closingIdRaw = formData.get('closing_id')
  const kindRaw = formData.get('kind')

  if (!(file instanceof File)) {
    return { success: false, error: 'No se recibió ninguna imagen.' }
  }

  const closingDate = typeof closingDateRaw === 'string' ? closingDateRaw.trim() : ''
  const closingId = typeof closingIdRaw === 'string' ? closingIdRaw.trim() : ''
  const kind = kindRaw === 'dataphone' || kindRaw === 'bdp-ticket' ? kindRaw : null

  if (!/^\d{4}-\d{2}-\d{2}$/.test(closingDate)) {
    return { success: false, error: 'Fecha de cierre no válida.' }
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(closingId)) {
    return { success: false, error: 'Identificador de cierre no válido.' }
  }
  if (!kind) {
    return { success: false, error: 'Tipo de foto no válido.' }
  }

  const mime = file.type || 'image/jpeg'
  if (!ALLOWED_MIME.has(mime)) {
    return { success: false, error: 'Formato no permitido. Usa JPG, PNG o WebP.' }
  }
  if (file.size > MAX_BYTES) {
    return { success: false, error: 'La imagen supera el límite de 5 MB.' }
  }

  const storagePath = buildStoragePath(closingDate, closingId, kind, extForMime(mime))
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await auth.supabase.storage
    .from('cash_closings')
    .upload(storagePath, buffer, { contentType: mime, upsert: true })

  if (uploadError) {
    const msg = uploadError.message ?? 'Error desconocido'
    if (msg.toLowerCase().includes('bucket') && msg.toLowerCase().includes('not found')) {
      return {
        success: false,
        error: "No existe el bucket 'cash_closings' en Storage. Ejecuta las migraciones de Supabase.",
      }
    }
    return { success: false, error: `Error al subir la imagen: ${msg}` }
  }

  return { success: true, path: storagePath }
}

export async function getCashClosingPhotoUrlsAction(params: {
  dataphonePath?: string | null
  bdpPath?: string | null
}): Promise<
  | {
      success: true
      dataphoneUrl: string | null
      bdpUrl: string | null
    }
  | { success: false; error: string }
> {
  const auth = await requireAuthenticated()
  if (!auth.ok) return { success: false, error: auth.error }

  const dataphonePath = typeof params.dataphonePath === 'string' ? params.dataphonePath.trim() : ''
  const bdpPath = typeof params.bdpPath === 'string' ? params.bdpPath.trim() : ''

  let dataphoneUrl: string | null = null
  let bdpUrl: string | null = null

  if (dataphonePath) {
    const { data, error } = await auth.supabase.storage
      .from('cash_closings')
      .createSignedUrl(dataphonePath, 60 * 10)
    if (error) return { success: false, error: `No se pudo abrir la foto de datáfonos: ${error.message}` }
    dataphoneUrl = data?.signedUrl ?? null
  }

  if (bdpPath) {
    const { data, error } = await auth.supabase.storage
      .from('cash_closings')
      .createSignedUrl(bdpPath, 60 * 10)
    if (error) return { success: false, error: `No se pudo abrir el ticket BDP: ${error.message}` }
    bdpUrl = data?.signedUrl ?? null
  }

  return { success: true, dataphoneUrl, bdpUrl }
}

export async function deleteCashClosingPhotosAction(paths: string[]): Promise<
  { success: true } | { success: false; error: string }
> {
  const auth = await requireAuthenticated()
  if (!auth.ok) return { success: false, error: auth.error }

  const uniquePaths = [...new Set(paths.map((p) => p.trim()).filter(Boolean))]
  if (uniquePaths.length === 0) return { success: true }

  const { error } = await auth.supabase.storage.from('cash_closings').remove(uniquePaths)
  if (error) return { success: false, error: error.message }

  return { success: true }
}
