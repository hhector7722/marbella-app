import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { K2_RECONCILIATION_TRUST_START } from '@/lib/albaranes/k5/batch-review'
import { selectCurrentProposalLineage } from '@/lib/albaranes/k5/proposal-lineage'
import { documentPagesReady } from '@/lib/albaranes/pipeline/pages'
import {
  isK5ReusableMappingVersion,
  isTrustedLegacyImportedMappingVersion,
} from '@/lib/albaranes/k5/trusted-mapping'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_PRICE_DELTA_RATIO = 0.25

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = ReturnType<typeof createClient<any>>

type AutoApplyRequest = {
  jobId: string
  leaseToken: string
  invoiceId: string
  extractionId: string
  previewOnly: boolean
}

type AutoApplyBlocked = {
  proposalId: string
  lineId: string | null
  reason: string
}

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null
  const valueNumber = Number(value)
  return Number.isFinite(valueNumber) ? valueNumber : null
}

function positive(value: unknown): boolean {
  const valueNumber = numberOrNull(value)
  return valueNumber != null && valueNumber > 0
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : []
}

function safeHexEqual(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(left) || !/^[0-9a-f]{64}$/i.test(right)) return false
  const a = Buffer.from(left, 'hex')
  const b = Buffer.from(right, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

function verifyInternalSignature(request: Request, rawBody: string, secret: string): boolean {
  const timestamp = request.headers.get('x-k5-timestamp')?.trim() ?? ''
  const signature = request.headers.get('x-k5-signature')?.trim() ?? ''
  const timestampSeconds = Number(timestamp)
  if (!Number.isFinite(timestampSeconds)) return false
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > 300) return false

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex')
  return safeHexEqual(signature, expected)
}

function parsePayload(rawBody: string): AutoApplyRequest | null {
  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>
    const jobId = text(parsed.jobId)
    const leaseToken = text(parsed.leaseToken)
    const invoiceId = text(parsed.invoiceId)
    const extractionId = text(parsed.extractionId)
    if (!jobId || !leaseToken || !invoiceId || !extractionId) return null
    return { jobId, leaseToken, invoiceId, extractionId,
      previewOnly: parsed.previewOnly === true }
  } catch {
    return null
  }
}

async function autoApplyDeterministicReceipts(
  supabase: AdminClient,
  payload: AutoApplyRequest,
  extractorVersion: string
): Promise<Record<string, unknown>> {
  const { data: invoiceData, error: invoiceError } = await supabase
    .from('purchase_invoices')
    .select('id,supplier_id,status,duplicate_of_invoice_id,expected_pages')
    .eq('id', payload.invoiceId)
    .maybeSingle()
  const invoice = invoiceData as { id?: string; supplier_id?: number | null; status?: string | null;
    duplicate_of_invoice_id?: string | null; expected_pages?: number | null } | null
  if (invoiceError || !invoice || invoice.supplier_id == null) {
    return { ok: true, applied: 0, blocked: [{ proposalId: '', lineId: null, reason: 'invoice_or_supplier_unavailable' }] }
  }
  if (text(invoice.status) === 'discarded') {
    return { ok: true, applied: 0, eligible: 0, blocked: [], reason: 'invoice_discarded' }
  }
  if (invoice.duplicate_of_invoice_id) {
    return { ok: true, applied: 0, eligible: 0, blocked: [], reason: 'invoice_possible_duplicate' }
  }

  const mistralJob = extractorVersion.startsWith('mistral-')
  if (mistralJob) {
    const expectedPages = Number(invoice.expected_pages ?? 1)
    const [{ count: attachmentCount, error: attachmentError },
      { data: documentJobs, error: documentJobsError }] = await Promise.all([
      supabase.from('purchase_invoice_attachments').select('id', { count: 'exact', head: true })
        .eq('invoice_id', payload.invoiceId),
      supabase.from('document_processing_jobs').select('id,status')
        .eq('invoice_id', payload.invoiceId).like('extractor_version', 'mistral-%'),
    ])
    if (attachmentError || documentJobsError) throw new Error('No se pudo verificar la integridad de las hojas.')
    if (!documentPagesReady({ expectedPages, attachmentCount: attachmentCount ?? 0,
      jobs: documentJobs ?? [], currentJobId: payload.jobId })) {
      return { ok: true, applied: 0, eligible: 0, blocked: [], reason: 'document_pages_pending' }
    }
  }

  const { data: proposalRows, error: proposalError } = await supabase
    .from('purchase_interpretation_proposals')
    .select('*')
    .eq('purchase_invoice_id', payload.invoiceId)
    .order('created_at', { ascending: true })
  if (proposalError) throw new Error('No se pudieron leer las propuestas K5 para autoaplicar K4.')

  const active = selectCurrentProposalLineage((proposalRows ?? []) as Array<Record<string, unknown>>)
    .filter((proposal) => mistralJob
      ? text(proposal.normalizer_version) === 'mistral-pipeline-v3'
        && text((proposal.provenance as Record<string, unknown> | null)?.source) === 'mistral_canonical'
      : text(proposal.document_extraction_id) === payload.extractionId)

  if (active.length === 0) {
    return { ok: true, applied: 0, eligible: 0, blocked: [], reason: 'no_active_proposals_for_extraction' }
  }

  const proposalIds = active.map((proposal) => text(proposal.id)).filter(Boolean)
  const mappingIds = [...new Set(active.map((proposal) => text(proposal.mapping_version_id)).filter(Boolean))]
  const aliasSourceIds = [...new Set(active.map((proposal) => {
    const interpreted = proposal.interpreted && typeof proposal.interpreted === 'object'
      ? proposal.interpreted as Record<string, unknown> : {}
    return text(interpreted.alias_source_mapping_version_id)
  }).filter(Boolean))]
  const allMappingIds = [...new Set([...mappingIds, ...aliasSourceIds])]
  const ingredientIds = [...new Set(active.map((proposal) => text(proposal.ingredient_id)).filter(Boolean))]

  const { data: lineRows, error: lineError } = await supabase
    .from('purchase_invoice_lines')
    .select('id,interpretation_proposal_id')
    .eq('invoice_id', payload.invoiceId)
    .in('interpretation_proposal_id', proposalIds)
  if (lineError) throw new Error('No se pudieron resolver las líneas K5 materializadas.')

  const lineByProposal = new Map<string, string>()
  for (const row of (lineRows ?? []) as Array<Record<string, unknown>>) {
    const proposalId = text(row.interpretation_proposal_id)
    const lineId = text(row.id)
    if (proposalId && lineId) lineByProposal.set(proposalId, lineId)
  }
  const lineIds = [...lineByProposal.values()]

  const { data: mappingRows, error: mappingError } = allMappingIds.length
    ? await supabase
        .from('purchase_mapping_versions')
        .select('id,status,legacy_mapping_id,idempotency_key,supplier_id,supplier_item_name,ingredient_id,conversion_factor,line_billing_unit,line_content_qty,line_content_unit,source_document_extraction_id')
        .in('id', allMappingIds)
    : { data: [] as Array<Record<string, unknown>>, error: null }
  if (mappingError) throw new Error('No se pudieron validar las versiones de mapeo K5.')
  const mappingById = new Map<string, Record<string, unknown>>(
    ((mappingRows ?? []) as Array<Record<string, unknown>>)
      .map((row) => [text(row.id), row] as const)
      .filter(([id]) => Boolean(id))
  )

  const { data: successorRows, error: successorError } = allMappingIds.length
    ? await supabase
        .from('purchase_mapping_versions')
        .select('supersedes_id')
        .in('supersedes_id', allMappingIds)
    : { data: [] as Array<Record<string, unknown>>, error: null }
  if (successorError) throw new Error('No se pudo comprobar la vigencia de los mapeos K5.')
  const supersededMappings = new Set(
    ((successorRows ?? []) as Array<Record<string, unknown>>).map((row) => text(row.supersedes_id)).filter(Boolean)
  )

  const { data: confirmationRows, error: confirmationError } = lineIds.length
    ? await supabase
        .from('purchase_receipt_confirmations')
        .select('purchase_invoice_line_id')
        .in('purchase_invoice_line_id', lineIds)
    : { data: [] as Array<Record<string, unknown>>, error: null }
  if (confirmationError) throw new Error('No se pudo comprobar la idempotencia económica K4.')
  const confirmedLines = new Set(
    ((confirmationRows ?? []) as Array<Record<string, unknown>>)
      .map((row) => text(row.purchase_invoice_line_id))
      .filter(Boolean)
  )

  const supplierId = text(invoice.supplier_id)
  const { data: trustedOrderRows, error: trustedOrderError } = ingredientIds.length
    ? await supabase
        .from('purchase_orders')
        .select('id')
        .eq('supplier_id', supplierId)
        .gte('created_at', K2_RECONCILIATION_TRUST_START)
    : { data: [] as Array<Record<string, unknown>>, error: null }
  if (trustedOrderError) throw new Error('No se pudo comprobar la conciliación de pedidos K2.')
  const trustedOrderIds = ((trustedOrderRows ?? []) as Array<Record<string, unknown>>).map((row) => text(row.id)).filter(Boolean)

  const { data: pendingRows, error: pendingError } = ingredientIds.length && trustedOrderIds.length
    ? await supabase
        .from('purchase_order_item_reconciliation')
        .select('ingredient_id')
        .in('ingredient_id', ingredientIds)
        .in('purchase_order_id', trustedOrderIds)
        .gt('quantity_pending', 0)
    : { data: [] as Array<Record<string, unknown>>, error: null }
  if (pendingError) throw new Error('No se pudo comprobar si hay pedidos pendientes que requieran asignación.')
  const ingredientsWithPendingOrders = new Set(
    ((pendingRows ?? []) as Array<Record<string, unknown>>).map((row) => text(row.ingredient_id)).filter(Boolean)
  )

  const blocked: AutoApplyBlocked[] = []
  const applied: Array<Record<string, unknown>> = []
  let eligible = 0

  for (const proposal of active) {
    const proposalId = text(proposal.id)
    const lineId = lineByProposal.get(proposalId) || null
    const mappingVersionId = text(proposal.mapping_version_id)
    const ingredientId = text(proposal.ingredient_id)
    const mappingVersion = mappingById.get(mappingVersionId) ?? null
    const trustedLegacyImport = mappingVersion ? isTrustedLegacyImportedMappingVersion(mappingVersion) : false
    const interpreted = proposal.interpreted && typeof proposal.interpreted === 'object'
      ? proposal.interpreted as Record<string, unknown> : {}
    const aliasSourceId = text(interpreted.alias_source_mapping_version_id)
    const sourceVersion = mappingById.get(aliasSourceId) ?? null
    const aliasKey = aliasSourceId
      ? `mistral-alias-v1:${aliasSourceId}:${createHash('sha256').update(JSON.stringify(text(proposal.source_item_name))).digest('hex')}`
      : ''
    const trustedMistralAlias = Boolean(mappingVersion && sourceVersion
      && text(mappingVersion.status) === 'proposed'
      && text(mappingVersion.idempotency_key) === aliasKey
      && text(mappingVersion.source_document_extraction_id) === text(proposal.document_extraction_id)
      && text(mappingVersion.supplier_item_name) === text(proposal.source_item_name)
      && text(mappingVersion.supplier_id) === supplierId
      && text(mappingVersion.ingredient_id) === ingredientId
      && text(sourceVersion.supplier_id) === supplierId
      && text(sourceVersion.ingredient_id) === ingredientId
      && isK5ReusableMappingVersion(sourceVersion)
      && !supersededMappings.has(aliasSourceId)
      && ['conversion_factor', 'line_billing_unit', 'line_content_qty', 'line_content_unit']
        .every((field) => text(mappingVersion[field]) === text(sourceVersion[field])))
    const provenance = proposal.provenance && typeof proposal.provenance === 'object'
      ? proposal.provenance as Record<string, unknown>
      : {}

    let blockReason: string | null = null
    if (text(proposal.status) !== 'ready_for_review') blockReason = 'proposal_not_ready'
    else if (Object.hasOwn(provenance, 'revision')) blockReason = 'manual_revision_requires_review'
    else if (text(provenance.source) === 'mistral_canonical') {
      const interpreted = proposal.interpreted && typeof proposal.interpreted === 'object'
        ? proposal.interpreted as Record<string, unknown> : {}
      const matchSource = text(interpreted.match_source)
      const matchScore = numberOrNull(interpreted.match_score)
      if (text(provenance.trigger) !== 'mistral_job_completion'
        || text(provenance.schema_version) !== 'mistral-pipeline-v3'
        || provenance.economic_effects !== false
        || text(proposal.normalizer_version) !== 'mistral-pipeline-v3'
        || !['code', 'exact_name', 'alias'].includes(matchSource)
        || matchScore == null || matchScore < 0.95) blockReason = 'mistral_confidence_insufficient'
    } else if (text(provenance.source) !== 'docling_evidence'
      || text(provenance.trigger) !== 'docling_completion') blockReason = 'proposal_origin_untrusted'
    else if (stringArray(proposal.review_reasons).length > 0) blockReason = 'review_reasons_present'
    else if (stringArray(proposal.warnings).length > 0) blockReason = 'warnings_present'
    else if (!lineId || !mappingVersionId || !ingredientId) blockReason = 'line_mapping_or_ingredient_missing'
    else if (!positive(proposal.line_quantity) || !positive(proposal.observed_unit_price) || !positive(proposal.physical_quantity) || !positive(proposal.purchase_quantity) || !positive(proposal.normalized_unit_price)) blockReason = 'economic_magnitudes_incomplete'
    else if (!text(proposal.line_unit) || !text(proposal.base_unit) || !text(proposal.purchase_unit)) blockReason = 'canonical_units_incomplete'
    else if (!mappingVersion || (!isK5ReusableMappingVersion(mappingVersion) && !trustedMistralAlias)
      || supersededMappings.has(mappingVersionId)) blockReason = 'mapping_not_reusable_leaf'
    else if (confirmedLines.has(lineId)) blockReason = 'already_confirmed'
    else if (ingredientsWithPendingOrders.has(ingredientId)) blockReason = 'pending_order_requires_allocation'

    if (blockReason) {
      blocked.push({ proposalId, lineId, reason: blockReason })
      continue
    }

    eligible += 1
    const idempotencyKey = `auto-k5:${proposalId}`
    const rpcParams = {
      p_invoice_line_id: lineId,
      p_mapping_version_id: mappingVersionId,
      p_allocations: [],
      p_idempotency_key: idempotencyKey,
      p_interpretation_proposal_id: proposalId,
    }

    const { data: previewData, error: previewError } = await supabase.rpc('apply_receipt_line_automated', {
      ...rpcParams,
      p_dry_run: true,
    })
    const preview = previewData as Record<string, unknown> | null
    if (previewError || !preview || preview.ok !== true || preview.proposal_validated !== true) {
      blocked.push({
        proposalId,
        lineId,
        reason: `k4_preview_blocked:${text(preview?.code) || previewError?.code || 'unknown'}`,
      })
      continue
    }

    if (preview.mapping_will_be_confirmed === true && !trustedLegacyImport && !trustedMistralAlias) {
      blocked.push({ proposalId, lineId, reason: 'mapping_requires_confirmation' })
      continue
    }

    const priceLocked = preview.price_locked === true
    const priceBefore = numberOrNull(preview.price_before)
    const priceAfter = numberOrNull(preview.price_after)
    if (!priceLocked) {
      if (priceBefore == null || priceBefore <= 0 || priceAfter == null || priceAfter <= 0) {
        blocked.push({ proposalId, lineId, reason: 'price_baseline_missing' })
        continue
      }
      const deltaRatio = Math.abs(priceAfter - priceBefore) / priceBefore
      if (!Number.isFinite(deltaRatio) || deltaRatio > MAX_PRICE_DELTA_RATIO) {
        blocked.push({ proposalId, lineId, reason: 'price_delta_over_25_percent' })
        continue
      }
    }

    if (payload.previewOnly) continue

    const { data: applyData, error: applyError } = await supabase.rpc('apply_receipt_line_automated', {
      ...rpcParams,
      p_dry_run: false,
    })
    const result = applyData as Record<string, unknown> | null
    if (applyError || !result || result.ok !== true || result.proposal_validated !== true) {
      blocked.push({
        proposalId,
        lineId,
        reason: `k4_apply_blocked:${text(result?.code) || applyError?.code || 'unknown'}`,
      })
      continue
    }

    applied.push({
      proposalId,
      lineId,
      confirmationId: text(result.confirmation_id),
      stockMovementId: text(result.stock_movement_id),
      idempotent: result.idempotent === true,
      priceChanged: result.price_changed === true,
    })
  }

  return {
    ok: true,
    eligible,
    applied: applied.length,
    previewOnly: payload.previewOnly,
    blocked,
    appliedItems: applied,
    maxPriceDeltaRatio: MAX_PRICE_DELTA_RATIO,
  }
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    return NextResponse.json({ ok: false, error: 'Configuración de servidor incompleta.' }, { status: 503 })
  }

  const rawBody = await request.text()
  if (rawBody.length > 8192) {
    return NextResponse.json({ ok: false, error: 'Payload demasiado grande.' }, { status: 413 })
  }

  const payload = parsePayload(rawBody)
  if (!payload) return NextResponse.json({ ok: false, error: 'Payload inválido.' }, { status: 400 })
  if (!verifyInternalSignature(request, rawBody, payload.leaseToken)) {
    return NextResponse.json({ ok: false, error: 'No autorizado.' }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient<any>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: leaseData, error: leaseError } = await supabase
    .from('document_processing_jobs')
    .select('id,invoice_id,status,lease_token,lease_expires_at,extractor_version')
    .eq('id', payload.jobId)
    .eq('invoice_id', payload.invoiceId)
    .eq('status', 'leased')
    .eq('lease_token', payload.leaseToken)
    .maybeSingle()
  if (leaseError) {
    console.error('k5-auto-apply lease lookup', leaseError)
    return NextResponse.json({ ok: false, error: 'No se pudo validar el lease Docling.' }, { status: 500 })
  }
  const lease = leaseData as { lease_expires_at?: string | null; extractor_version?: string | null } | null
  const leaseExpiresAt = Date.parse(text(lease?.lease_expires_at))
  if (!lease || !Number.isFinite(leaseExpiresAt) || leaseExpiresAt <= Date.now()) {
    return NextResponse.json({ ok: false, error: 'Lease Docling inválido o caducado.' }, { status: 401 })
  }

  try {
    const result = await autoApplyDeterministicReceipts(supabase, payload,
      text(lease.extractor_version))
    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    console.error('k5-auto-apply', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Error inesperado al autoaplicar K4.' },
      { status: 500 }
    )
  }
}
