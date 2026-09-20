'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import {
  K5_NORMALIZER_VERSION,
  normalizeDoclingEvidence,
  proposalInputFingerprint,
  type K5LegacyIdentitySnapshot,
  type K5MappingSnapshot,
  type K5NormalizedProposal,
} from '@/lib/albaranes/k5/normalizer'
import {
  hashSupplierProfile,
  versionedSupplierProfileForId,
} from '@/lib/albaranes/k5/profile-registry'
import { selectCurrentProposalLineage } from '@/lib/albaranes/k5/proposal-lineage'
import { isK5ReusableMappingVersion } from '@/lib/albaranes/k5/trusted-mapping'

export type InterpretationProposalView = {
  id: string
  proposalSetId: string
  extractionId: string
  profileId: string | null
  profileVersion: string | null
  profileHash: string | null
  normalizerVersion: string
  sourceTableIndex: number | null
  sourceRowIndex: number | null
  sourceItemName: string | null
  mappingVersionId: string | null
  ingredientId: string | null
  status: 'needs_mapping' | 'needs_review' | 'excluded' | 'ready_for_review'
  observed: Record<string, unknown>
  interpreted: Record<string, unknown>
  normalized: Record<string, unknown>
  pricing: Record<string, unknown>
  reviewReasons: string[]
  warnings: string[]
  lineId: string | null
  confirmed: boolean
  createdAt: string
}

export type InterpretationExtractionView = {
  id: string
  extractorVersion: string
  fileVersionHash: string
  extractedAt: string
  status: string
}

type PurchaseManagerGate =
  | {
      ok: true
      supabase: Awaited<ReturnType<typeof createClient>>
      userId: string
    }
  | { ok: false; message: string }

async function requirePurchaseManager(): Promise<PurchaseManagerGate> {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) return { ok: false, message: 'Inicia sesión para continuar.' }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (error || (profile?.role !== 'manager' && profile?.role !== 'admin')) {
    return { ok: false, message: 'Solo manager o administración puede interpretar y revisar albaranes.' }
  }
  return { ok: true, supabase, userId: user.id }
}

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function sourceKey(tableIndex: unknown, rowIndex: unknown): string {
  return `${tableIndex == null ? 'document' : String(tableIndex)}:${rowIndex == null ? 'document' : String(rowIndex)}`
}

async function reusableMappingSnapshots(
  supabase: Extract<PurchaseManagerGate, { ok: true }>['supabase'],
  supplierId: number
): Promise<K5MappingSnapshot[]> {
  const { data: versions, error } = await supabase
    .from('purchase_mapping_versions')
    .select('id,legacy_mapping_id,supplier_item_name,ingredient_id,conversion_factor,line_billing_unit,line_content_qty,line_content_unit,status,supersedes_id,idempotency_key')
    .eq('supplier_id', supplierId)
  if (error) throw new Error('No se pudieron leer las versiones de mapeo.')

  const rows = (versions ?? []) as Array<Record<string, unknown>>
  const supersededIds = new Set(rows.map((row) => text(row.supersedes_id)).filter(Boolean))
  const reusableLeaves = rows.filter((row) =>
    isK5ReusableMappingVersion(row)
    && !supersededIds.has(text(row.id))
    && text(row.ingredient_id)
    && text(row.line_billing_unit)
    && text(row.line_content_qty)
    && text(row.line_content_unit)
  )

  const ingredientIds = [...new Set(reusableLeaves.map((row) => text(row.ingredient_id)).filter(Boolean))]
  if (ingredientIds.length === 0) return []

  const { data: ingredients, error: ingredientError } = await supabase
    .from('ingredients')
    .select('id,purchase_unit,base_unit')
    .in('id', ingredientIds)
  if (ingredientError) throw new Error('No se pudieron comprobar las unidades de los ingredientes mapeados.')

  const ingredientById = new Map(
    (ingredients ?? []).map((ingredient: Record<string, unknown>) => [text(ingredient.id), ingredient])
  )

  return reusableLeaves.flatMap((row): K5MappingSnapshot[] => {
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

async function legacyIdentitySnapshots(
  supabase: Extract<PurchaseManagerGate, { ok: true }>['supabase'],
  supplierId: number
): Promise<K5LegacyIdentitySnapshot[]> {
  const { data, error } = await supabase
    .from('supplier_item_mappings')
    .select('supplier_item_name,ingredient_id')
    .eq('supplier_id', supplierId)
    .not('ingredient_id', 'is', null)
  if (error) throw new Error('No se pudieron leer las identidades legacy del proveedor.')

  return (data ?? []).flatMap((row: Record<string, unknown>) => {
    const supplierItemName = text(row.supplier_item_name)
    const ingredientId = text(row.ingredient_id)
    return supplierItemName && ingredientId ? [{ supplierItemName, ingredientId }] : []
  })
}

async function activeProposalsForInvoice(
  supabase: Extract<PurchaseManagerGate, { ok: true }>['supabase'],
  invoiceId: string
): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await supabase
    .from('purchase_interpretation_proposals')
    .select('*')
    .eq('purchase_invoice_id', invoiceId)
    .order('created_at', { ascending: true })
  if (error) throw new Error('No se pudieron leer las propuestas K5.')
  const rows = (data ?? []) as Array<Record<string, unknown>>
  return selectCurrentProposalLineage(rows)
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
  userId: string
  supersedesProposalId: string | null
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
    ingredient_id: n.ingredientId,
    observed: n.observed,
    interpreted: n.interpreted,
    normalized: n.normalized,
    pricing: n.pricing,
    status: n.status,
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
    created_by: params.userId,
    provenance: {
      schema_version: 'k5-v1',
      profile_hash_kind: params.profileHash ? 'canonical-json-sha256-v1' : null,
      source: 'docling_evidence',
      economic_effects: false,
    },
  }
}

async function materializeProposalLine(params: {
  supabase: Extract<PurchaseManagerGate, { ok: true }>['supabase']
  invoiceId: string
  proposal: Record<string, unknown>
  previousProposalId: string | null
}): Promise<string | null> {
  const { supabase, invoiceId, proposal, previousProposalId } = params
  const proposalId = text(proposal.id)
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
    if (confirmation?.id) return text(line.id)
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
  if (error || !inserted?.id) throw new Error('La propuesta se guardó, pero no se pudo crear su línea revisable.')
  return text(inserted.id)
}

export async function listInterpretationContextAction(params: { invoiceId: string }): Promise<
  | {
      success: true
      extractions: InterpretationExtractionView[]
      proposals: InterpretationProposalView[]
      profile: { id: string; version: string; hash: string } | null
    }
  | { success: false; message: string }
> {
  const gate = await requirePurchaseManager()
  if (!gate.ok) return { success: false, message: gate.message }
  const invoiceId = text(params?.invoiceId)
  if (!invoiceId) return { success: false, message: 'Albarán inválido.' }

  const { data: invoice, error: invoiceError } = await gate.supabase
    .from('purchase_invoices')
    .select('id,supplier_id')
    .eq('id', invoiceId)
    .maybeSingle()
  if (invoiceError || !invoice) return { success: false, message: 'No se pudo abrir el albarán.' }

  const { data: extractionRows, error: extractionError } = await gate.supabase
    .from('document_extractions')
    .select('id,extractor_version,file_version_hash,extracted_at,status')
    .eq('invoice_id', invoiceId)
    .order('extracted_at', { ascending: false })
  if (extractionError) return { success: false, message: 'No se pudo leer la evidencia documental.' }

  let active: Array<Record<string, unknown>>
  try {
    active = await activeProposalsForInvoice(gate.supabase, invoiceId)
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'No se pudieron leer las propuestas.' }
  }

  const proposalIds = active.map((row) => text(row.id)).filter(Boolean)
  const { data: lineRows } = proposalIds.length
    ? await gate.supabase
        .from('purchase_invoice_lines')
        .select('id,interpretation_proposal_id')
        .in('interpretation_proposal_id', proposalIds)
    : { data: [] as Array<Record<string, unknown>> }
  const lineByProposal = new Map(
    ((lineRows ?? []) as Array<Record<string, unknown>>).map((row) => [text(row.interpretation_proposal_id), text(row.id)])
  )

  const { data: linkRows } = proposalIds.length
    ? await gate.supabase
        .from('purchase_receipt_interpretation_links')
        .select('interpretation_proposal_id')
        .in('interpretation_proposal_id', proposalIds)
    : { data: [] as Array<Record<string, unknown>> }
  const confirmed = new Set(((linkRows ?? []) as Array<Record<string, unknown>>).map((row) => text(row.interpretation_proposal_id)))

  const supplierId = Number(invoice.supplier_id)
  const versioned = Number.isFinite(supplierId) ? versionedSupplierProfileForId(supplierId) : null

  return {
    success: true,
    extractions: (extractionRows ?? []).map((row: Record<string, unknown>) => ({
      id: text(row.id),
      extractorVersion: text(row.extractor_version),
      fileVersionHash: text(row.file_version_hash),
      extractedAt: text(row.extracted_at),
      status: text(row.status),
    })),
    proposals: active.map((row) => ({
      id: text(row.id),
      proposalSetId: text(row.proposal_set_id),
      extractionId: text(row.document_extraction_id),
      profileId: text(row.supplier_profile_id) || null,
      profileVersion: text(row.supplier_profile_version) || null,
      profileHash: text(row.supplier_profile_hash) || null,
      normalizerVersion: text(row.normalizer_version),
      sourceTableIndex: row.source_table_index == null ? null : Number(row.source_table_index),
      sourceRowIndex: row.source_row_index == null ? null : Number(row.source_row_index),
      sourceItemName: text(row.source_item_name) || null,
      mappingVersionId: text(row.mapping_version_id) || null,
      ingredientId: text(row.ingredient_id) || null,
      status: text(row.status) as InterpretationProposalView['status'],
      observed: (row.observed ?? {}) as Record<string, unknown>,
      interpreted: (row.interpreted ?? {}) as Record<string, unknown>,
      normalized: (row.normalized ?? {}) as Record<string, unknown>,
      pricing: (row.pricing ?? {}) as Record<string, unknown>,
      reviewReasons: Array.isArray(row.review_reasons) ? row.review_reasons.map(text) : [],
      warnings: Array.isArray(row.warnings) ? row.warnings.map(text) : [],
      lineId: lineByProposal.get(text(row.id)) || null,
      confirmed: confirmed.has(text(row.id)),
      createdAt: text(row.created_at),
    })),
    profile: versioned
      ? { id: versioned.profile.id, version: versioned.profile.version, hash: versioned.hash }
      : null,
  }
}

export async function generateInterpretationProposalsAction(params: {
  invoiceId: string
  extractionId: string
}): Promise<
  | { success: true; proposals: InterpretationProposalView[]; created: number }
  | { success: false; message: string }
> {
  const gate = await requirePurchaseManager()
  if (!gate.ok) return { success: false, message: gate.message }
  const invoiceId = text(params?.invoiceId)
  const extractionId = text(params?.extractionId)
  if (!invoiceId || !extractionId) return { success: false, message: 'Selecciona una extracción concreta.' }

  const { data: invoice, error: invoiceError } = await gate.supabase
    .from('purchase_invoices')
    .select('id,supplier_id,content_sha256,file_path')
    .eq('id', invoiceId)
    .maybeSingle()
  if (invoiceError || !invoice || invoice.supplier_id == null) {
    return { success: false, message: 'El albarán debe tener un proveedor antes de interpretarlo.' }
  }

  const { data: extraction, error: extractionError } = await gate.supabase
    .from('document_extractions')
    .select('id,invoice_id,file_version_hash,extractor_version,raw_json_artifact,status')
    .eq('id', extractionId)
    .eq('invoice_id', invoiceId)
    .maybeSingle()
  if (extractionError || !extraction || extraction.status !== 'success') {
    return { success: false, message: 'La extracción seleccionada no existe o todavía no es evidencia válida.' }
  }

  const sourceFileHash = text(extraction.file_version_hash)
  if (!sourceFileHash || (invoice.content_sha256 && text(invoice.content_sha256) !== sourceFileHash)) {
    return { success: false, message: 'La extracción no corresponde a la versión actual del documento.' }
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
    let mappings: K5MappingSnapshot[]
    try {
      mappings = await reusableMappingSnapshots(gate.supabase, supplierId)
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'No se pudieron validar los mapeos.' }
    }
    let legacyIdentities: K5LegacyIdentitySnapshot[]
    try {
      legacyIdentities = await legacyIdentitySnapshots(gate.supabase, supplierId)
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'No se pudieron validar los aliases legacy.' }
    }
    normalized = normalizeDoclingEvidence({
      profile: versioned.profile,
      rawArtifact: extraction.raw_json_artifact,
      supplierId,
      mappings,
      legacyIdentities,
    }).proposals
  }

  let activeBefore: Array<Record<string, unknown>>
  try {
    activeBefore = await activeProposalsForInvoice(gate.supabase, invoiceId)
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'No se pudieron preparar las propuestas.' }
  }
  const activeBySource = new Map(activeBefore.map((row) => [sourceKey(row.source_table_index, row.source_row_index), row]))
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
      userId: gate.userId,
      supersedesProposalId: previous ? text(previous.id) : null,
    })
  })

  // Cada recálculo explícito es un nuevo hecho interpretativo append-only. El
  // fingerprint conserva la reproducibilidad del input, pero no se usa como
  // identidad única: volver a la misma interpretación después de una revisión
  // anterior debe crear una nueva propuesta que supersede a la vigente.
  const { data: inserted, error: insertError } = await gate.supabase
    .from('purchase_interpretation_proposals')
    .insert(payloads)
    .select('*')
  if (insertError) {
    const concurrent = /single_successor|duplicate key|unique/i.test(insertError.message)
    return {
      success: false,
      message: concurrent
        ? 'La propuesta cambió mientras se recalculaba. Recarga el albarán antes de continuar.'
        : `No se pudieron persistir las propuestas K5: ${insertError.message}`,
    }
  }
  const persisted = (inserted ?? []) as Array<Record<string, unknown>>

  for (const proposal of persisted) {
    const previous = activeBySource.get(sourceKey(proposal.source_table_index, proposal.source_row_index))
    try {
      await materializeProposalLine({
        supabase: gate.supabase,
        invoiceId,
        proposal,
        previousProposalId: previous ? text(previous.id) : null,
      })
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'No se pudo preparar la revisión de líneas.' }
    }
  }

  revalidatePath('/dashboard/albaranes')
  revalidatePath('/dashboard/albaranes/k5')
  const context = await listInterpretationContextAction({ invoiceId })
  if (!context.success) return context
  return { success: true, proposals: context.proposals, created: persisted.length }
}
