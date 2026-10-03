import { createHash, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import {
  extractWithMistral,
  fileSha256,
  MISTRAL_EXTRACTOR_VERSION,
} from '@/lib/albaranes/extractors/mistral'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  const received = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!secret || !received) return false
  const left = createHash('sha256').update(secret).digest()
  const right = createHash('sha256').update(received).digest()
  return timingSafeEqual(left, right)
}

function mimeForPath(path: string): string | null {
  if (/\.jpe?g$/i.test(path)) return 'image/jpeg'
  if (/\.png$/i.test(path)) return 'image/png'
  if (/\.pdf$/i.test(path)) return 'application/pdf'
  return null
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const mistralKey = process.env.MISTRAL_API_KEY
  if (!url || !serviceKey || !mistralKey) {
    return NextResponse.json({ error: 'Configuración de servidor incompleta' }, { status: 503 })
  }

  let invoiceId: string
  try {
    const body = await request.json() as Record<string, unknown>
    invoiceId = typeof body.invoiceId === 'string' ? body.invoiceId : ''
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })
  }
  if (!UUID.test(invoiceId)) return NextResponse.json({ error: 'Identificador inválido' }, { status: 400 })

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: invoice, error: invoiceError } = await db.from('purchase_invoices')
    .select('id,file_path,content_sha256')
    .eq('id', invoiceId).maybeSingle()
  if (invoiceError || !invoice) return NextResponse.json({ error: 'Albarán no disponible' }, { status: 404 })

  const sourcePath = String(invoice.file_path)
  const mimeType = mimeForPath(sourcePath)
  if (!mimeType) return NextResponse.json({ error: 'Formato no soportado' }, { status: 415 })
  const { data: file, error: downloadError } = await db.storage.from('albaranes').download(sourcePath)
  if (downloadError || !file) return NextResponse.json({ error: 'Archivo no disponible' }, { status: 502 })
  const bytes = new Uint8Array(await file.arrayBuffer())
  const hash = fileSha256(bytes)
  if (invoice.content_sha256 && invoice.content_sha256 !== hash) {
    return NextResponse.json({ error: 'El archivo no coincide con su huella registrada' }, { status: 409 })
  }

  const { data: cached, error: cacheError } = await db.from('document_shadow_extractions')
    .select('id,model,canonical_json,metrics')
    .eq('file_sha256', hash)
    .eq('extractor_version', MISTRAL_EXTRACTOR_VERSION)
    .eq('status', 'success')
    .order('created_at', { ascending: false })
    .limit(1).maybeSingle()
  if (cacheError) return NextResponse.json({ error: 'Caché de evidencia no disponible' }, { status: 500 })
  if (cached) {
    return NextResponse.json({ ok: true, cached: true, extractionId: cached.id,
      model: cached.model, canonical: cached.canonical_json, metrics: cached.metrics })
  }

  try {
    const extraction = await extractWithMistral({ bytes, mimeType, apiKey: mistralKey })
    const metrics = {
      page_count: extraction.pageCount,
      line_count: extraction.canonical.lines.length,
      elapsed_ms: extraction.elapsedMs,
      usage_info: extraction.usageInfo,
    }
    const { data: saved, error: saveError } = await db.from('document_shadow_extractions').insert({
      source_invoice_id: invoiceId,
      source_bucket: 'albaranes',
      source_path: sourcePath,
      file_sha256: hash,
      extractor: 'mistral',
      extractor_version: extraction.extractorVersion,
      schema_version: extraction.schemaVersion,
      model: extraction.model,
      status: 'success',
      raw_json_artifact: extraction.rawResponse,
      canonical_json: extraction.canonical,
      metrics,
    }).select('id').single()
    if (saveError || !saved) throw new Error('shadow_persist_failed')
    return NextResponse.json({ ok: true, cached: false, extractionId: saved.id,
      model: extraction.model, canonical: extraction.canonical, metrics })
  } catch (error) {
    const errorCode = error instanceof Error ? error.message.slice(0, 160) : 'unexpected_error'
    const safeCode = /^Mistral OCR devolvió HTTP \d{3}$/.test(errorCode)
      ? errorCode : 'shadow_extraction_failed'
    await db.from('document_shadow_extractions').insert({
      source_invoice_id: invoiceId,
      source_bucket: 'albaranes',
      source_path: sourcePath,
      file_sha256: hash,
      extractor: 'mistral',
      extractor_version: MISTRAL_EXTRACTOR_VERSION,
      schema_version: 'document-observation-v2',
      model: 'mistral-ocr-4-1',
      status: 'failed',
      metrics: {},
      error_code: safeCode,
    })
    return NextResponse.json({ error: safeCode }, { status: 502 })
  }
}
