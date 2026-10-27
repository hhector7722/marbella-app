import { createHash, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 10 * 1024 * 1024
const MAX_JSON_CHARS = 14 * 1024 * 1024

function authenticated(request: Request) {
  const secret = process.env.ALBARANES_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!secret || !bearer) return false
  const left = createHash('sha256').update(bearer).digest()
  const right = createHash('sha256').update(secret).digest()
  return timingSafeEqual(left, right)
}

function detectMime(buffer: Buffer, filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext === 'pdf' && buffer.subarray(0, 5).toString('ascii') === '%PDF-')
    return { mime: 'application/pdf', ext: 'pdf' }
  if ((ext === 'jpg' || ext === 'jpeg') && buffer[0] === 0xff && buffer[1] === 0xd8)
    return { mime: 'image/jpeg', ext: 'jpg' }
  if (ext === 'png' && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
    return { mime: 'image/png', ext: 'png' }
  return null
}

function normalizeSender(from: unknown): string | null {
  const raw = typeof from === 'string' ? from.trim() : ''
  const match = raw.match(/(?:<)?([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})(?:>)?/)
  return match ? match[1]!.toLowerCase() : null
}

function suggestKind(filename: string, subject: string): 'monthly_invoice' | 'delivery_note' | 'unknown' {
  const t = (filename + ' ' + subject).toLocaleLowerCase('es')
  if (/factura\s+(mensual|del\s+mes)|resumen\s+mensual|liquidaci[oó]n\s+mensual|facturas?\s+agrupadas?/i.test(t)) {
    return 'monthly_invoice'
  }
  if (/albar[aá]n|nota\s+de\s+entrega/i.test(t) && !/factura|mensual/i.test(t)) {
    return 'delivery_note'
  }
  return 'unknown'
}

function reply(message: string, status: number) {
  return NextResponse.json({ success: false, accepted: false, error: message }, { status })
}

/**
 * Gmail transports supplier evidence. Approved sender addresses automatically
 * create a purchase document and durable OCR job; stock only flows through
 * the K5 confirmed delivery-note policy and no-stock database guards.
 */
export async function POST(request: Request) {
  if (!authenticated(request)) return reply('No autorizado', 401)
  if (Number(request.headers.get('content-length') ?? 0) > MAX_JSON_CHARS * 2) {
    return reply('Documento demasiado grande', 413)
  }
  let payload: Record<string, unknown>
  try {
    const raw = await request.text()
    if (raw.length > MAX_JSON_CHARS) return reply('Documento demasiado grande', 413)
    payload = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return reply('JSON inválido', 400)
  }
  const messageId = String(payload.gmailMessageId ?? '').trim()
  const index = Number(payload.attachmentIndex)
  const filename = String(payload.filename ?? '').trim().slice(0, 240)
  const sender = normalizeSender(payload.from)
  const subject = String(payload.subject ?? '').slice(0, 500)
  const base64 = String(payload.fileBase64 ?? '')
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(messageId) ||
      !Number.isInteger(index) || index < 0 || index > 49 ||
      !filename || !sender || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) ||
      base64.length > 14_000_000) {
    return reply('Datos del adjunto incompletos o inválidos', 400)
  }
  const buffer = Buffer.from(base64, 'base64')
  if (!buffer.length || buffer.length > MAX_BYTES) return reply('Archivo vacío o demasiado grande', 413)
  const detected = detectMime(buffer, filename)
  if (!detected) return reply('Solo se admiten PDF, JPG y PNG auténticos', 415)
  const date = typeof payload.emailDate === 'string' ? new Date(payload.emailDate) : null
  const emailDate = date && Number.isFinite(date.getTime()) ? date.toISOString() : null
  const contentHash = createHash('sha256').update(buffer).digest('hex')
  const path = `email-inbox/${contentHash.slice(0, 2)}/${contentHash}.${detected.ext}`

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return reply('Configuración de almacenamiento incompleta', 503)
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const { data: acknowledged, error: ackError } = await supabase
    .from('purchase_email_documents').select('id,status,invoice_id')
    .eq('gmail_message_id', messageId).eq('attachment_index', index).maybeSingle()
  if (ackError) return reply('No se pudo consultar el registro de recepción', 503)
  if (acknowledged) {
    // An acknowledged but still pending upload may be retried after a temporary
    // database error. Do not silently tell Apps Script that OCR was enqueued.
    if (acknowledged.status === 'received') {
      const { data: promoted, error: promotionError } = await supabase.rpc(
        'auto_import_purchase_email_document', { p_document_id: acknowledged.id })
      if (promotionError) return reply('Recepción guardada, pero falló la cola OCR; reintentar', 503)
      return NextResponse.json({ success: true, accepted: true,
        processing: promoted?.automated ? 'ocr_queued' : 'pending_review',
        documentId: acknowledged.id, invoiceId: promoted?.invoice_id ?? null })
    }
    return NextResponse.json({
      success: true, accepted: true, processing: 'already_acknowledged',
      documentId: acknowledged.id, invoiceId: acknowledged.invoice_id,
    })
  }

  // Remitentes confirmados por propietario: coincidencia de email completo,
  // nunca por dominio genérico. No autoriza por sí sola una recepción de stock.
  const { data: supplierSender, error: supplierError } = await supabase
    .from('purchase_supplier_sender_addresses')
    .select('supplier_id')
    .eq('sender_email', sender)
    .maybeSingle()
  if (supplierError) return reply('No se pudo identificar el remitente', 503)

  // Content hash protects against reforwarded files even with new Gmail IDs.
  const { data: previous, error: previousError } = await supabase
    .from('purchase_email_documents').select('id,storage_path')
    .eq('content_sha256', contentHash).is('duplicate_of', null)
    .limit(1).maybeSingle()
  if (previousError) return reply('No se pudo verificar si el documento ya existía', 503)
  const { data: existingInvoice, error: invoiceError } = await supabase
    .from('purchase_invoices').select('id').eq('content_sha256', contentHash)
    .neq('status', 'discarded').limit(1).maybeSingle()
  if (invoiceError) return reply('No se pudo verificar la ausencia de duplicados', 503)

  if (!previous) {
    const { error: storageError } = await supabase.storage
      .from('albaranes').upload(path, buffer, {
        contentType: detected.mime, upsert: false,
      })
    if (storageError && !/already exists|duplicate/i.test(storageError.message)) {
      return reply('No se pudo conservar el adjunto original', 503)
    }
  }
  const duplicate = Boolean(previous || existingInvoice)
  const row = {
    gmail_message_id: messageId,
    attachment_index: index,
    sender_email: sender,
    email_subject: subject,
    email_date: emailDate,
    filename, mime_type: detected.mime,
    content_sha256: contentHash,
    storage_path: previous?.storage_path ?? path,
    suggested_kind: suggestKind(filename, subject),
    supplier_id: supplierSender?.supplier_id ?? null,
    duplicate_of: previous?.id ?? null,
    status: duplicate ? 'duplicate' : 'received',
    error_message: existingInvoice ? 'Archivo existente en albaranes; sin segunda importación' : null,
  }
  const { data: inserted, error: insertError } = await supabase
    .from('purchase_email_documents').insert(row).select('id,status').single()

  if (insertError || !inserted) {
    // Concurrent script retries may attempt the same email or hash.
    if (insertError?.code === '23505') {
      const { data: existing } = await supabase.from('purchase_email_documents')
        .select('id').eq('gmail_message_id', messageId)
        .eq('attachment_index', index).maybeSingle()
      if (existing) return NextResponse.json({
        success: true, accepted: true, processing: 'already_acknowledged', documentId: existing.id,
      })
      return reply('Recepción concurrente: reintentar para registrar el duplicado', 503)
    }
    console.error('[albaranes-email] failed to archive inbox record', insertError?.message)
    return reply('No se pudo registrar el adjunto recibido', 503)
  }
  if (!duplicate) {
    // Only full addresses approved by the owner are eligible for auto-import.
    // The DB guard enforces the same source verification and idempotency.
    const { data: promoted, error: promotionError } = await supabase.rpc(
      'auto_import_purchase_email_document', { p_document_id: inserted.id })
    if (promotionError) {
      console.error('[albaranes-email] OCR queue error:', promotionError.code)
      return reply('Archivo guardado; cola OCR no disponible, reintentar', 503)
    }
    return NextResponse.json({
      success: true, accepted: true,
      processing: promoted?.automated ? 'ocr_queued' : 'pending_review',
      documentId: inserted.id,
      invoiceId: promoted?.invoice_id ?? null,
    })
  }
  return NextResponse.json({
    success: true, accepted: true,
    processing: 'duplicate',
    documentId: inserted.id,
  })
}

export async function GET() {
  return NextResponse.json({ error: 'Los documentos recibidos se muestran en /dashboard/albaranes' }, { status: 405 })
}
