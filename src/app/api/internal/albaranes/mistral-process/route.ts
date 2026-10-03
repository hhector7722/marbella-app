import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { canonicalDocumentSchema, type CanonicalDocument } from '@/lib/albaranes/extractors/canonical'
import { extractWithMistral, fileSha256, MISTRAL_EXTRACTOR_VERSION,
  MISTRAL_OCR_MODEL } from '@/lib/albaranes/extractors/mistral'
import { proposeMistralExtraction } from '@/lib/albaranes/pipeline/propose'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

type Job = { job_id: string; invoice_id: string; storage_bucket: string;
  storage_path: string; file_version_hash: string; extractor_version: string;
  correlation_id: string }

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!secret || !supplied) return false
  const left = createHash('sha256').update(secret).digest()
  const right = createHash('sha256').update(supplied).digest()
  return timingSafeEqual(left, right)
}

function mimeForPath(path: string): string | null {
  if (/\.jpe?g$/i.test(path)) return 'image/jpeg'
  if (/\.png$/i.test(path)) return 'image/png'
  if (/\.pdf$/i.test(path)) return 'application/pdf'
  return null
}

function retryable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : ''
  return /HTTP (429|5\d\d)|fetch failed|timeout|timed out|_unavailable|_insert_failed|auto_apply_failed/.test(message)
}

async function autoApplyFromJob(request: Request, job: Job, leaseToken: string,
  extractionId: string): Promise<Record<string, unknown>> {
  const payload = JSON.stringify({ jobId: job.job_id, leaseToken,
    invoiceId: job.invoice_id, extractionId })
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = createHmac('sha256', leaseToken)
    .update(`${timestamp}.${payload}`, 'utf8').digest('hex')
  const response = await fetch(new URL('/api/internal/albaranes/k5/auto-apply', request.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-k5-timestamp': timestamp,
      'x-k5-signature': signature },
    body: payload,
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error('auto_apply_failed')
  const result = await response.json() as Record<string, unknown>
  if (result.ok !== true) throw new Error('auto_apply_failed')
  return result
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const mistralKey = process.env.MISTRAL_API_KEY
  if (!url || !serviceKey || !mistralKey) {
    return NextResponse.json({ error: 'Configuración de servidor incompleta' }, { status: 503 })
  }
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const leaseToken = randomUUID()
  const { data: claimed, error: claimError } = await db.rpc('claim_mistral_evidence_job', {
    p_lease_token: leaseToken, p_lease_seconds: 180,
  })
  if (claimError) return NextResponse.json({ error: 'Cola no disponible' }, { status: 503 })
  if (!claimed) return NextResponse.json({ ok: true, processed: false })
  const job = claimed as Job
  const started = Date.now()
  let extractionId: string | null = null
  let metrics: Record<string, unknown> = { extractor: 'mistral', model: MISTRAL_OCR_MODEL }

  try {
    if (job.extractor_version !== MISTRAL_EXTRACTOR_VERSION || job.storage_bucket !== 'albaranes') {
      throw new Error('job_version_invalid')
    }
    const mimeType = mimeForPath(job.storage_path)
    if (!mimeType) throw new Error('unsupported_file_format')
    const { data: original, error: downloadError } = await db.storage
      .from('albaranes').download(job.storage_path)
    if (downloadError || !original) throw new Error('source_file_unavailable')
    const bytes = new Uint8Array(await original.arrayBuffer())
    const hash = fileSha256(bytes)
    if (hash !== job.file_version_hash) throw new Error('source_hash_mismatch')

    const { data: previous, error: previousError } = await db.from('document_extractions')
      .select('id,raw_json_artifact,status').eq('invoice_id', job.invoice_id)
      .eq('file_version_hash', hash).eq('extractor_version', MISTRAL_EXTRACTOR_VERSION)
      .maybeSingle()
    if (previousError) throw new Error('extraction_cache_unavailable')

    let canonical: CanonicalDocument
    if (previous?.status === 'success') {
      extractionId = previous.id
      canonical = canonicalDocumentSchema.parse(
        (previous.raw_json_artifact as Record<string, unknown>)?.canonical)
      metrics.cached = true
    } else {
      const { data: shadow, error: shadowError } = await db.from('document_shadow_extractions')
        .select('canonical_json,raw_json_artifact,metrics,model')
        .eq('file_sha256', hash).eq('extractor_version', MISTRAL_EXTRACTOR_VERSION)
        .eq('status', 'success').order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (shadowError) throw new Error('shadow_cache_unavailable')
      let response: unknown
      let model = MISTRAL_OCR_MODEL
      if (shadow) {
        canonical = canonicalDocumentSchema.parse(shadow.canonical_json)
        response = shadow.raw_json_artifact
        model = shadow.model
        metrics.cached = true
        metrics.shadow_reused = true
        metrics.usage_info = (shadow.metrics as Record<string, unknown>)?.usage_info ?? null
      } else {
        const extracted = await extractWithMistral({ bytes, mimeType, apiKey: mistralKey,
          signal: AbortSignal.timeout(90_000) })
        canonical = extracted.canonical
        response = extracted.rawResponse
        model = extracted.model
        metrics.cached = false
        metrics.ocr_elapsed_ms = extracted.elapsedMs
        metrics.page_count = extracted.pageCount
        metrics.usage_info = extracted.usageInfo
      }
      const { data: inserted, error: insertError } = await db.from('document_extractions')
        .insert({ invoice_id: job.invoice_id, file_version_hash: hash,
          extractor_version: MISTRAL_EXTRACTOR_VERSION,
          raw_json_artifact: { extractor: 'mistral', model, canonical, response },
          status: 'success' }).select('id').single()
      if (insertError || !inserted) throw new Error('extraction_insert_failed')
      extractionId = inserted.id
    }

    if (!extractionId) throw new Error('extraction_missing')
    const proposals = await proposeMistralExtraction({ db, invoiceId: job.invoice_id,
      extractionId, sourceHash: hash, canonical, correlationId: job.correlation_id })
    const auto = process.env.ALBARAN_AUTO_RECEIPT_MISTRAL === 'enabled'
      && (proposals.skipped == null || proposals.skipped === 'already_received')
      ? await autoApplyFromJob(request, job, leaseToken, extractionId)
      : null
    metrics = { ...metrics, duration_ms: Date.now() - started,
      line_count: canonical.lines.length, mapped_line_count: proposals.ready,
      auto_applied_line_count: Number(auto?.applied ?? 0),
      exception_count: Array.isArray(auto?.blocked) ? auto.blocked.length : proposals.exceptions,
      proposal_count: proposals.created, skipped: proposals.skipped ?? null }
    const { error: completeError } = await db.rpc('complete_mistral_evidence_job', {
      p_job_id: job.job_id, p_lease_token: leaseToken,
      p_evidence_extraction_id: extractionId, p_succeeded: true,
      p_metrics: metrics, p_error: null, p_retryable: false,
    })
    if (completeError) throw new Error('job_completion_failed')
    return NextResponse.json({ ok: true, processed: true, jobId: job.job_id,
      extractionId, metrics })
  } catch (error) {
    const code = error instanceof Error ? error.message : 'unexpected_error'
    const safeCode = /^[a-z_]+$/.test(code) || /^Mistral OCR devolvió HTTP \d{3}$/.test(code)
      ? code : 'processing_failed'
    const isRetryable = retryable(error)
    metrics = { ...metrics, duration_ms: Date.now() - started, error: safeCode }
    await db.rpc('complete_mistral_evidence_job', {
      p_job_id: job.job_id, p_lease_token: leaseToken,
      p_evidence_extraction_id: extractionId, p_succeeded: false,
      p_metrics: metrics, p_error: safeCode, p_retryable: isRetryable,
    })
    return NextResponse.json({ ok: false, jobId: job.job_id, error: safeCode,
      retryScheduled: isRetryable }, { status: 502 })
  }
}

export const GET = POST
