'use server'

import { createHash } from 'node:crypto'
import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

// Versión declarada, no una regla de dominio. Una futura selección de evidence
// siempre será explícita por `document_extractions.id`, nunca por esta cadena.
const DOCLING_SCANNER_EXTRACTOR_VERSION = 'docling-serve-v1.21.0-k3.3-scanner'

async function gateAuthenticated() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) return { ok: false as const, message: 'No autenticado', supabase: null }

  return { ok: true as const, supabase, userId: user.id }
}

export type ProcessScannerImageResult =
  | { success: true; invoiceId?: string }
  | { success: false; message: string; invoiceId?: string }

export type RecentInvoiceForSupplierItem = {
  id: string
  invoice_number: string | null
  invoice_date: string | null
  created_at: string
}

function parseBase64DataUri(base64DataUri: string): { mimeType: string; buffer: Buffer } | null {
  const matches = base64DataUri.match(/^data:([A-Za-z0-9.+-/]+);base64,(.+)$/)
  if (!matches || matches.length !== 3) return null
  return { mimeType: matches[1], buffer: Buffer.from(matches[2], 'base64') }
}

function todayYmdLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function revalidateScannerPaths() {
  revalidatePath('/dashboard/albaranes-precios')
  revalidatePath('/dashboard/scanner')
  revalidatePath('/dashboard/albaranes')
}

async function enqueueDoclingEvidence(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: {
    invoiceId: string
    fileVersionHash: string
    storagePath: string
    sourceAttachmentId?: string | null
  }
): Promise<{ ok: true; jobId: string; inserted: boolean; status: string } | { ok: false; message: string }> {
  const { data, error } = await supabase.rpc('enqueue_docling_evidence_job', {
    p_invoice_id: params.invoiceId,
    p_file_version_hash: params.fileVersionHash,
    p_storage_path: params.storagePath,
    p_extractor_version: DOCLING_SCANNER_EXTRACTOR_VERSION,
    p_source_attachment_id: params.sourceAttachmentId ?? null,
  })

  if (error) return { ok: false, message: error.message }
  const result = data as { job_id?: string; inserted?: boolean; status?: string } | null
  const jobId = String(result?.job_id ?? '').trim()
  if (!jobId) return { ok: false, message: 'La cola no devolvió un trabajo durable.' }
  return {
    ok: true,
    jobId,
    inserted: Boolean(result?.inserted),
    status: String(result?.status ?? 'pending'),
  }
}

export async function listRecentInvoicesForSupplierAction(params: {
  supplierId: number
  limit?: number
}): Promise<{ success: true; items: RecentInvoiceForSupplierItem[] } | { success: false; message: string }> {
  const gate = await gateAuthenticated()
  if (!gate.ok || !gate.supabase) return { success: false, message: gate.message }

  const supplierId = Number(params.supplierId)
  if (!Number.isFinite(supplierId) || supplierId <= 0) return { success: false, message: 'Proveedor inválido' }
  const limit = Math.min(Math.max(Number(params.limit ?? 40) || 40, 1), 80)
  const { data, error } = await gate.supabase
    .from('purchase_invoices')
    .select('id, invoice_number, invoice_date, created_at')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return { success: false, message: error.message }

  return {
    success: true,
    items: (data ?? []).map((row) => ({
      id: String(row.id),
      invoice_number: row.invoice_number ?? null,
      invoice_date: row.invoice_date ?? null,
      created_at: String(row.created_at ?? ''),
    })),
  }
}

/** Guarda una hoja adicional y crea inmediatamente su trabajo durable Docling. */
export async function appendScannerPageToInvoiceAction(params: {
  base64DataUri: string
  filename: string
  supplierId: number
  invoiceId: string
}): Promise<ProcessScannerImageResult> {
  try {
    const gate = await gateAuthenticated()
    if (!gate.ok || !gate.supabase) return { success: false, message: gate.message }
    const supabase = gate.supabase
    const supplierId = Number(params.supplierId)
    const invoiceId = String(params.invoiceId ?? '').trim()
    if (!Number.isFinite(supplierId) || supplierId <= 0) return { success: false, message: 'Proveedor inválido' }
    if (!invoiceId) return { success: false, message: 'Albarán no seleccionado' }

    const parsed = parseBase64DataUri(params.base64DataUri)
    if (!parsed) return { success: false, message: 'Formato de imagen inválido' }
    const contentSha256 = createHash('sha256').update(parsed.buffer).digest('hex')

    const { data: invoice, error: invoiceError } = await supabase
      .from('purchase_invoices')
      .select('id, supplier_id, content_sha256')
      .eq('id', invoiceId)
      .maybeSingle()
    if (invoiceError) return { success: false, message: invoiceError.message }
    if (!invoice) return { success: false, message: 'Albarán no encontrado' }
    if (Number(invoice.supplier_id) !== supplierId) {
      return { success: false, message: 'El albarán elegido no corresponde a este proveedor.' }
    }
    if (String(invoice.content_sha256 ?? '') === contentSha256) {
      return { success: false, message: 'Es la misma imagen que la hoja principal. Sube la otra hoja.' }
    }

    const { data: duplicateAttachment, error: duplicateError } = await supabase
      .from('purchase_invoice_attachments')
      .select('id')
      .eq('invoice_id', invoiceId)
      .eq('content_sha256', contentSha256)
      .maybeSingle()
    if (duplicateError) return { success: false, message: duplicateError.message }
    if (duplicateAttachment) return { success: false, message: 'Esta imagen ya está vinculada a este albarán.' }

    const now = new Date()
    const filePath = `${gate.userId}/${now.getFullYear()}/${now.getMonth() + 1}/${Date.now()}_append_${params.filename}`
    const { error: uploadError } = await supabase.storage.from('albaranes').upload(filePath, parsed.buffer, {
      contentType: parsed.mimeType,
    })
    if (uploadError) return { success: false, message: `Error Storage: ${uploadError.message}` }

    const { data: lastPage, error: lastPageError } = await supabase
      .from('purchase_invoice_attachments')
      .select('page_order')
      .eq('invoice_id', invoiceId)
      .order('page_order', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (lastPageError) return { success: false, message: lastPageError.message }
    const pageOrder = Number.isFinite(Number(lastPage?.page_order)) ? Number(lastPage?.page_order) + 1 : 2

    const { data: attachment, error: attachmentError } = await supabase
      .from('purchase_invoice_attachments')
      .insert({
        invoice_id: invoiceId,
        file_path: filePath,
        content_sha256: contentSha256,
        page_order: pageOrder,
        created_by: gate.userId,
        ocr_status: 'pending',
      })
      .select('id')
      .single()
    if (attachmentError || !attachment) {
      return { success: false, message: attachmentError?.message ?? 'Error guardando la hoja adicional' }
    }

    const queued = await enqueueDoclingEvidence(supabase, {
      invoiceId,
      fileVersionHash: contentSha256,
      storagePath: filePath,
      sourceAttachmentId: attachment.id,
    })
    if (!queued.ok) {
      revalidateScannerPaths()
      return {
        success: false,
        invoiceId,
        message: `La hoja se ha conservado, pero no se pudo encolar: ${queued.message}. Reintenta desde el albarán.`,
      }
    }

    revalidateScannerPaths()
    return { success: true, invoiceId }
  } catch (error) {
    console.error('appendScannerPageToInvoiceAction:', error)
    return { success: false, message: 'Error inesperado al añadir la hoja. Reintenta.' }
  }
}

/** Captura el original y encola Docling; no llama Gemini ni crea líneas de compra. */
export async function processScannerImage(
  base64DataUri: string,
  filename: string,
  supplierId: number
): Promise<ProcessScannerImageResult> {
  try {
    const gate = await gateAuthenticated()
    if (!gate.ok || !gate.supabase) return { success: false, message: gate.message }
    const supabase = gate.supabase
    if (!Number.isFinite(supplierId) || supplierId <= 0) {
      return { success: false, message: 'Falta el proveedor. Selecciónalo antes de escanear.' }
    }
    const parsed = parseBase64DataUri(base64DataUri)
    if (!parsed) return { success: false, message: 'Formato de imagen inválido' }
    const contentSha256 = createHash('sha256').update(parsed.buffer).digest('hex')

    const { data: duplicate, error: duplicateError } = await supabase.rpc('check_purchase_invoice_duplicate', {
      p_content_sha256: contentSha256,
      p_supplier_id: supplierId,
      p_invoice_number: null,
      p_invoice_date: null,
    })
    if (duplicateError) return { success: false, message: duplicateError.message }
    if (Boolean((duplicate as { dup_by_hash?: boolean } | null)?.dup_by_hash)) {
      return { success: false, message: 'Este documento ya fue subido (misma imagen). No se duplica el albarán.' }
    }

    const now = new Date()
    const filePath = `${gate.userId}/${now.getFullYear()}/${now.getMonth() + 1}/${Date.now()}_scanner_${filename}`
    const { error: uploadError } = await supabase.storage.from('albaranes').upload(filePath, parsed.buffer, {
      contentType: parsed.mimeType,
    })
    if (uploadError) return { success: false, message: `Error Storage: ${uploadError.message}` }

    const { data: invoice, error: invoiceError } = await supabase
      .from('purchase_invoices')
      .insert({
        created_by: gate.userId,
        supplier_id: supplierId,
        invoice_number: 'PROCESANDO…',
        invoice_date: todayYmdLocal(),
        total_amount: 0,
        file_path: filePath,
        status: 'processing',
        source: 'scanner',
        content_sha256: contentSha256,
        ocr_error: null,
      })
      .select('id')
      .single()
    if (invoiceError || !invoice) {
      return { success: false, message: invoiceError?.message ?? 'Error al guardar la cabecera del albarán' }
    }

    const invoiceId = String(invoice.id)
    const queued = await enqueueDoclingEvidence(supabase, {
      invoiceId,
      fileVersionHash: contentSha256,
      storagePath: filePath,
    })
    if (!queued.ok) {
      revalidateScannerPaths()
      return {
        success: false,
        invoiceId,
        message: `El documento se ha conservado, pero no se pudo encolar: ${queued.message}. Reintenta desde el albarán.`,
      }
    }

    revalidateScannerPaths()
    return { success: true, invoiceId }
  } catch (error) {
    console.error('processScannerImage:', error)
    return { success: false, message: 'Error inesperado procesando el albarán. Reintenta.' }
  }
}

/** Reintenta solo un trabajo fallido sin evidence o recupera un pending sin duplicarlo. */
export async function retryOcrInvoiceAction(invoiceId: string): Promise<ProcessScannerImageResult> {
  try {
    const gate = await gateAuthenticated()
    if (!gate.ok || !gate.supabase) return { success: false, message: gate.message }
    const supabase = gate.supabase
    const id = String(invoiceId ?? '').trim()
    if (!id) return { success: false, message: 'ID inválido' }

    const { data: retryResult, error: retryError } = await supabase.rpc('retry_docling_evidence_jobs', {
      p_invoice_id: id,
    })
    if (retryError) return { success: false, message: retryError.message }
    const retry = retryResult as { requeued_count?: number; immutable_failure_count?: number } | null
    if (Number(retry?.requeued_count ?? 0) > 0) {
      revalidateScannerPaths()
      return { success: true, invoiceId: id }
    }
    if (Number(retry?.immutable_failure_count ?? 0) > 0) {
      return {
        success: false,
        message: 'La extracción fallida ya es evidencia histórica. Su revisión requiere una nueva versión de extractor; no se sobrescribe.',
      }
    }

    const { data: invoice, error: invoiceError } = await supabase
      .from('purchase_invoices')
      .select('id, file_path, content_sha256')
      .eq('id', id)
      .maybeSingle()
    if (invoiceError) return { success: false, message: invoiceError.message }
    if (!invoice?.file_path || !invoice.content_sha256) return { success: false, message: 'Sin documento original para reintentar.' }

    const mainJob = await enqueueDoclingEvidence(supabase, {
      invoiceId: id,
      fileVersionHash: invoice.content_sha256,
      storagePath: invoice.file_path,
    })
    if (!mainJob.ok) return { success: false, message: mainJob.message }

    const { data: attachments, error: attachmentsError } = await supabase
      .from('purchase_invoice_attachments')
      .select('id, file_path, content_sha256')
      .eq('invoice_id', id)
      .in('ocr_status', ['pending', 'failed'])
    if (attachmentsError) return { success: false, message: attachmentsError.message }
    for (const attachment of attachments ?? []) {
      if (!attachment.file_path || !attachment.content_sha256) continue
      const queued = await enqueueDoclingEvidence(supabase, {
        invoiceId: id,
        fileVersionHash: attachment.content_sha256,
        storagePath: attachment.file_path,
        sourceAttachmentId: attachment.id,
      })
      if (!queued.ok) return { success: false, message: queued.message }
    }

    revalidateScannerPaths()
    return { success: true, invoiceId: id }
  } catch (error) {
    console.error('retryOcrInvoiceAction:', error)
    return { success: false, message: 'Error inesperado al reintentar Docling. Reintenta.' }
  }
}

/** Preserva original y evidence: no se sustituye un documento histórico. */
export async function replaceScannerImageAction(params: {
  invoiceId: string
  base64DataUri: string
  filename: string
}): Promise<ProcessScannerImageResult> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }
  void params
  return {
    success: false,
    message: 'La sustitución queda bloqueada hasta disponer de versionado documental. Sube un nuevo albarán y conserva el original.',
  }
}
