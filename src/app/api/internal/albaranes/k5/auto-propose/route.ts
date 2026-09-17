import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  K5_NORMALIZER_VERSION,
  normalizeDoclingEvidence,
  proposalInputFingerprint,
  type K5MappingSnapshot,
  type K5NormalizedProposal,
} from '@/lib/albaranes/k5/normalizer'
import {
  hashSupplierProfile,
  versionedSupplierProfileForId,
} from '@/lib/albaranes/k5/profile-registry'
import { selectCurrentProposalLineage } from '@/lib/albaranes/k5/proposal-lineage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type AdminClient = ReturnType<typeof createClient>

type AutoProposalRequest = {
  invoiceId: string
  extractionId: string
  correlationId?: string | null
}

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function sourceKey(tableIndex: unknown, rowIndex: unknown): string {
  return `${tableIndex == null ? 'document' : String(tableIndex)}:${rowIndex == null ? 'document' : String(rowIndex)}`
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

function parsePayload(rawBody: string): AutoProposalRequest | null {
  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>
    const invoiceId = text(parsed.invoiceId)
    const extractionId = text(parsed.extractionId)
    const correlationId = text(parsed.correlationId) || null
    if (!invoiceId || !extractionId) return null
    return { invoiceId, extractionId, correlationId }
  } catch {
    return null
  }
}

async function confirmedMappingSnapshots(
  supabase: AdminClient,
  supplierId: number
): Promise<K5MappingSnapshot[]> {
  const { data: versions, error } = await supabase
    .from('purchase_mapping_versions')
    .select('id,supplier_item_name,ingredient_id,conversion_factor,line_billing_unit,line_content_qty,line_content_unit,status,supersedes_id')
    .eq('supplier_id', supplierId)
  if (error) throw new Error('No se pudieron leer las versiones de mapeo.')

  const rows = (versions ?? []) as Array<Record<string, unknown>>
  const supersededIds = new Set(rows.map((row) => text(row.supersedes_id)).filter(Boolean))
  const confirmedLeaves = rows.filter((row) =>
    row.status === 'confirmed'
    && !supersededIds.has(text(row.id))
    && text(row.ingredient_id)
    && text(row.line_billing_unit)
    && text(row.line_content_qty)
    && text(row.line_content_unit)
  )

  const ingredientIds = [...new Set(confirmedLeaves.map((row) => text(row.ingredient_id)).filter(Boolean))]
  if (ingredientIds.length === 0) return []

  const { data: ingredients, error: ingredientError } = await supabase
    .from('ingredients')
    .select('id,purchase_unit,base_unit')
    .in('id', ingredientIds)
  if (ingredientError) throw new Error('No se pudieron comprobar las unidades de los ingredientes mapeados.')

  const ingredientById = new Map(
    ((ingredients ?? []) as Array<Record<string, unknown>>).map((ingredient) => [text(ingredient.id), ingredient])
  )

  return confirmedLeaves.flatMap((row): K5MappingSnapshot[] => {
    const ingredientId = text(row.ingredient_id)
    const ingredient = ingredientById.get(ingredientId)
    const purchaseUnit = text(ingredient?.purchase_unit)
    const baseUnit = text(ingredient?.base_unit)
    if (!purchaseUnit || !baseUnit) return []
    return [{
      id: text(row.id),
      supplierItemName: text(row.supplier_item_name),
      ingredientId,
      conversionFactor: text(row.conversion_factor),
      lineBillingUnit: text(row.line_billing_unit),
      lineContentQty: text(row.line_content_qty),
      lineContentUnit: text(row.line_content_unit),
      purchaseUnit,
      baseUnit,
    }]
  })
}

async function activeProposalsForInvoice(
  supabase: AdminClient,
  invoiceId: string
): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await supabase
    .from('purchase_interpretation_proposals')
    .select('*')
    .eq('purchase_invoice_id', invoiceId)
    .order('created_at', { ascending: true })
  if (error) throw new Error('No se pudieron leer las propuestas K5.')
  return selectCurrentProposalLineage((data ?? []) as Array<Record<string, unknown>>)
}

function proposalPayload(params: {
  normalized: K5NormalizedProposal
  proposalSetId: string
  invoiceId: string
  extractionId: string
  supplierId: number
  sourceFileHash: string
  profileId: string | null
  profileVersion: string | null
  profileHash: string | null
  createdBy: string
  supersedesProposalId: string | null
  correlationId: string | null
}): Record<string, unknown> {
  const n = params.normalized
  const fingerprint = proposalInputFingerprint({
    invoice_id: params.invoiceId,
    extraction_id: params.extractionId,
    source_file_hash: params.sourceFileHash,
    supplier_id: params.supplierId,
    profile_id: params.profileId,
    profile_version: params.profileVersion,
    profile_hash: params.profileHash,
    normalizer_version: K5_NORMALIZER_VERSION,
    source_table_index: n.sourceTableIndex,
    source_row_index: n.sourceRowIndex,
    mapping_version_id: n.mappingVersionId,
    observed: n.observed,
    interpreted: n.interpreted,
    normalized: n.normalized,
    pricing: n.pricing,
    status: n.status,
  })

  return {
    proposal_set_id: params.proposalSetId,
    purchase_invoice_id: params.invoiceId,
    document_extraction_id: params.extractionId,
    supplier_id: params.supplierId,
    supplier_profile_id: params.profileId,
    supplier_profile_version: params.profileVersion,
    supplier_profile_hash: params.profileHash,
    normalizer_version: K5_NORMALIZER_VERSION,
    source_file_hash: params.sourceFileHash,
    input_fingerprint: fingerprint,
    source_table_index: n.sourceTableIndex,
    source_row_index: n.sourceRowIndex,
    source_item_name: n.sourceItemName,
    mapping_version_id: n.mappingVersionId,
    ingredient_id: n.ingredientId,
    status: n.status,
    observed: n.observed,
    interpreted: n.interpreted,
    normalized: n.normalized,
    pricing: n.pricing,
    proposed_allocations: [],
    review_reasons: n.reviewReasons,
    warnings: n.warnings,
    line_quantity: n.lineQuantity,
    line_unit: n.lineUnit,
    observed_unit_price: n.observedUnitPrice,
    line_total: n.lineTotal,
    physical_quantity: n.physicalQuantity,
    base_unit: n.baseUnit,
    purchase_quantity: n.purchaseQuantity,
    purchase_unit: n.purchaseUnit,
    normalized_unit_price: n.normalizedUnitPrice,
    supersedes_proposal_id: params.supersedesProposalId,
    created_by: params.createdBy,
    provenance: {
      schema_version: 'k5-v1',
      profile_hash_kind: params.profileHash ? 'canonical-json-sha256-v1' : null,
      source: 'docling_evidence',
      trigger: 'docling_completion',
      correlation_id: params.correlationId,
      economic_effects: false,
    },
  }
}

async function materializeProposalLine(params: {
  supabase: AdminClient
  invoiceId: string
  proposal: Record<string, unknown>
}): Promise<string | null> {
  const { supabase, invoiceId, proposal } = params
  const proposalId = text(proposal.id)
  const previousProposalId = text(proposal.supersedes_proposal_id) || null
  const sourceItemName = text(proposal.source_item_name)
  const status = text(proposal.status)
  if (!proposalId || !sourceItemName) return null

  let line: Record<string, unknown> | null = null
  if (previousProposalId) {
    const { data } = await supabase
      .from('purchase_invoice_lines')
      .select('id,interpretation_proposal_id')
      .eq('invoice_id', invoiceId)
      .eq('interpretation_proposal_id', previousProposalId)
      .maybeSingle()
    line = (data as Record<string, unknown> | null) ?? null
  }
  if (!line) {
    const { data } = await supabase
      .from('purchase_invoice_lines')
      .select('id,interpretation_proposal_id')
      .eq('invoice_id', invoiceId)
      .eq('interpretation_proposal_id', proposalId)
      .maybeSingle()
    line = (data as Record<string, unknown> | null) ?? null
  }

  if (line?.id) {
    const { data: confirmation } = await supabase
      .from('purchase_receipt_confirmations')
      .select('id')
      .eq('purchase_invoice_line_id', text(line.id))
      .maybeSingle()
    const confirmationRow = confirmation as { id?: string } | null
    if (confirmationRow?.id) return text(line.id)
  }

  const lineStatus = status === 'ready_for_review'
    ? 'mapped'
    : status === 'excluded'
      ? 'excluded'
      : 'pending'

  const patch: Record<string, unknown> = {
    interpretation_proposal_id: proposalId,
    original_name: sourceItemName,
    quantity: proposal.line_quantity,
    line_unit: proposal.line_unit,
    unit_price: proposal.observed_unit_price,
    total_price: proposal.line_total,
    mapped_ingredient_id: status === 'ready_for_review' ? proposal.ingredient_id : null,
    status: lineStatus,
  }

  if (line?.id) {
    const { error } = await supabase
      .from('purchase_invoice_lines')
      .update(patch)
      .eq('id', text(line.id))
    if (error) throw new Error('La propuesta se guardó, pero no se pudo vincular a su línea revisable.')
    return text(line.id)
  }

  const { data: inserted, error } = await supabase
    .from('purchase_invoice_lines')
    .insert({ invoice_id: invoiceId, ...patch })
    .select('id')
    .maybeSingle()
  const insertedRow = inserted as { id?: string } | null
  if (error || !insertedRow?.id) throw new Error('La propuesta se guardó, pero no se pudo crear su línea revisable.')
  return text(insertedRow.id)
}

async function generateAutomaticProposals(
  supabase: AdminClient,
  params: AutoProposalRequest
): Promise<Record<string, unknown>> {
  const { invoiceId, extractionId, correlationId = null } = params

  const { data: invoiceData, error: invoiceError } = await supabase
    .from('purchase_invoices')
    .select('id,supplier_id,content_sha256,created_by')
    .eq('id', invoiceId)
    .maybeSingle()
  const invoice = invoiceData as {
    id?: string
    supplier_id?: number | null
    content_sha256?: string | null
    created_by?: string | null
  } | null
  if (invoiceError || !invoice) throw new Error('No se pudo abrir el albarán para K5.')
  if (invoice.supplier_id == null) {
    return { ok: true, skipped: 'supplier_missing', created: 0, materialized: 0 }
  }
  const createdBy = text(invoice.created_by)
  if (!createdBy) {
    return { ok: true, skipped: 'invoice_created_by_missing', created: 0, materialized: 0 }
  }

  const { data: extractionData, error: extractionError } = await supabase
    .from('document_extractions')
    .select('id,invoice_id,file_version_hash,extractor_version,raw_json_artifact,status')
    .eq('id', extractionId)
    .eq('invoice_id', invoiceId)
    .maybeSingle()
  const extraction = extractionData as {
    id?: string
    invoice_id?: string
    file_version_hash?: string | null
    extractor_version?: string
    raw_json_artifact?: unknown
    status?: string
  } | null
  if (extractionError || !extraction) throw new Error('No se pudo cargar la extracción Docling para K5.')
  if (extraction.status !== 'success') {
    return { ok: true, skipped: 'extraction_not_success', created: 0, materialized: 0 }
  }

  const sourceFileHash = text(extraction.file_version_hash)
  if (!sourceFileHash || (invoice.content_sha256 && text(invoice.content_sha256) !== sourceFileHash)) {
    return { ok: true, skipped: 'stale_extraction', created: 0, materialized: 0 }
  }

  const supplierId = Number(invoice.supplier_id)
  const versioned = versionedSupplierProfileForId(supplierId)
  let normalized: K5NormalizedProposal[]
  let profileId: string | null = null
  let profileVersion: string | null = null
  let profileHash: string | null = null

  if (!versioned) {
    normalized = [{
      sourceTableIndex: null,
      sourceRowIndex: null,
      sourceItemName: null,
      mappingVersionId: null,
      ingredientId: null,
      status: 'needs_review',
      observed: { extraction_id: extractionId, supplier_id: supplierId },
      interpreted: {},
      normalized: {},
      pricing: {},
      reviewReasons: ['supplier_profile_missing'],
      warnings: [],
      lineQuantity: null,
      lineUnit: null,
      observedUnitPrice: null,
      lineTotal: null,
      physicalQuantity: null,
      baseUnit: null,
      purchaseQuantity: null,
      purchaseUnit: null,
      normalizedUnitPrice: null,
    }]
  } else {
    profileId = versioned.profile.id
    profileVersion = versioned.profile.version
    profileHash = hashSupplierProfile(versioned.profile)
    const mappings = await confirmedMappingSnapshots(supabase, supplierId)
    normalized = normalizeDoclingEvidence({
      profile: versioned.profile,
      rawArtifact: extraction.raw_json_artifact,
      supplierId,
      mappings,
    }).proposals
  }

  const activeBefore = await activeProposalsForInvoice(supabase, invoiceId)
  const activeBySource = new Map(
    activeBefore.map((row) => [sourceKey(row.source_table_index, row.source_row_index), row])
  )
  const proposalSetId = crypto.randomUUID()
  const payloads = normalized.map((proposal) => {
    const previous = activeBySource.get(sourceKey(proposal.sourceTableIndex, proposal.sourceRowIndex))
    return proposalPayload({
      normalized: proposal,
      proposalSetId,
      invoiceId,
      extractionId,
      supplierId,
      sourceFileHash,
      profileId,
      profileVersion,
      profileHash,
      createdBy,
      supersedesProposalId: previous ? text(previous.id) : null,
      correlationId,
    })
  })

  const fingerprints = payloads.map((payload) => text(payload.input_fingerprint)).filter(Boolean)
  const { data: existingRows, error: existingError } = fingerprints.length
    ? await supabase
        .from('purchase_interpretation_proposals')
        .select('*')
        .eq('purchase_invoice_id', invoiceId)
        .eq('document_extraction_id', extractionId)
        .in('input_fingerprint', fingerprints)
        .order('created_at', { ascending: false })
    : { data: [] as Array<Record<string, unknown>>, error: null }
  if (existingError) throw new Error('No se pudo comprobar la idempotencia de K5.')

  const existingByFingerprint = new Map<string, Record<string, unknown>>()
  for (const row of (existingRows ?? []) as Array<Record<string, unknown>>) {
    const fingerprint = text(row.input_fingerprint)
    if (fingerprint && !existingByFingerprint.has(fingerprint)) existingByFingerprint.set(fingerprint, row)
  }

  const missingPayloads = payloads.filter((payload) => !existingByFingerprint.has(text(payload.input_fingerprint)))
  let inserted: Array<Record<string, unknown>> = []
  if (missingPayloads.length > 0) {
    const { data, error } = await supabase
      .from('purchase_interpretation_proposals')
      .insert(missingPayloads)
      .select('*')
    if (error) {
      const concurrent = /single_successor|duplicate key|unique/i.test(error.message)
      if (concurrent) throw new Error('K5 cambió concurrentemente; el job se reintentará de forma idempotente.')
      throw new Error(`No se pudieron persistir las propuestas K5: ${error.message}`)
    }
    inserted = (data ?? []) as Array<Record<string, unknown>>
  }

  const candidates = [
    ...inserted,
    ...payloads.flatMap((payload) => {
      const existing = existingByFingerprint.get(text(payload.input_fingerprint))
      return existing ? [existing] : []
    }),
  ]

  const activeAfter = await activeProposalsForInvoice(supabase, invoiceId)
  const activeIds = new Set(activeAfter.map((row) => text(row.id)).filter(Boolean))
  let materialized = 0
  for (const proposal of candidates) {
    if (!activeIds.has(text(proposal.id))) continue
    const lineId = await materializeProposalLine({ supabase, invoiceId, proposal })
    if (lineId) materialized += 1
  }

  return {
    ok: true,
    created: inserted.length,
    materialized,
    idempotent: inserted.length === 0,
    proposalSetId: inserted.length > 0 ? proposalSetId : null,
    normalizerVersion: K5_NORMALIZER_VERSION,
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
  if (!verifyInternalSignature(request, rawBody, serviceRoleKey)) {
    return NextResponse.json({ ok: false, error: 'No autorizado.' }, { status: 401 })
  }

  const payload = parsePayload(rawBody)
  if (!payload) {
    return NextResponse.json({ ok: false, error: 'Payload inválido.' }, { status: 400 })
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const result = await generateAutomaticProposals(supabase, payload)
    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    console.error('k5-auto-propose', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Error inesperado en K5.' },
      { status: 500 }
    )
  }
}
