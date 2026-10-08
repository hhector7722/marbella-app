import { createHash, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { CanonicalDocument } from '../extractors/canonical.ts'
import { assessDocument } from './assess.ts'
import { buildSupplierMemory, type IngredientUnitRow, type LegacyMappingRow,
  type ObservedCodeRow, type VersionRow } from './memory.ts'
import { proposalMappingPair } from './proposal-pair.ts'
import { selectReplayProposals } from './proposal-replay.ts'

// El acceso a datos del proyecto aún no tiene tipos generados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = ReturnType<typeof createClient<any>>

export const MISTRAL_PIPELINE_VERSION = 'mistral-pipeline-v3'
const PROFILE_ID = 'mistral-canonical'
const PROFILE_VERSION = '5'
const PROFILE_HASH = createHash('sha256').update('mistral-canonical|5|schema-v2|math-v3|confirmed-code-memory-v3').digest('hex')

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export async function proposeMistralExtraction(params: {
  db: AdminClient
  invoiceId: string
  extractionId: string
  sourceHash: string
  canonical: CanonicalDocument
  correlationId: string | null
}): Promise<{ created: number; materialized: number; ready: number; exceptions: number; skipped?: string }> {
  const { db } = params
  const { data: invoice, error: invoiceError } = await db.from('purchase_invoices')
    .select('id,supplier_id,created_by,status,duplicate_of_invoice_id').eq('id', params.invoiceId).maybeSingle()
  if (invoiceError || !invoice) throw new Error('mistral_invoice_unavailable')
  if (invoice.status === 'discarded' || invoice.status === 'received' || invoice.duplicate_of_invoice_id
      || invoice.supplier_id == null || !invoice.created_by) {
    return { created: 0, materialized: 0, ready: 0, exceptions: 0, skipped: 'invoice_not_eligible' }
  }
  // No transformar documentos que ya tienen recepciones; el backfill es solo lectura.
  const { data: confirmed, error: confirmedError } = await db.from('purchase_receipt_confirmations')
    .select('id').eq('purchase_invoice_id', params.invoiceId).limit(1)
  if (confirmedError) throw new Error('mistral_confirmations_unavailable')
  if (confirmed?.length) return { created: 0, materialized: 0, ready: 0, exceptions: 0, skipped: 'already_received' }

  const { data: invoiceLines, error: invoiceLinesError } = await db.from('purchase_invoice_lines')
    .select('id,interpretation_proposal_id,superseded_by_extraction_id').eq('invoice_id', params.invoiceId)
  if (invoiceLinesError) throw new Error('mistral_existing_lines_unavailable')
  let oldLineIds: string[] = []
  if (invoiceLines?.length) {
    const { data: ownProposals, error: ownError } = await db.from('purchase_interpretation_proposals')
      .select('id').eq('purchase_invoice_id', params.invoiceId)
      .like('normalizer_version', 'mistral-pipeline-%')
    if (ownError) throw new Error('mistral_existing_proposals_unavailable')
    const ownIds = new Set((ownProposals ?? []).map((row) => row.id))
    if (invoiceLines.some((line) => !line.interpretation_proposal_id
      && !line.superseded_by_extraction_id)) {
      return { created: 0, materialized: 0, ready: 0, exceptions: 0,
        skipped: 'manual_lines_require_review' }
    }
    // Las líneas antiguas siguen siendo evidencia histórica. Se retiran de la
    // vista operativa solo después de materializar todas las líneas Mistral.
    oldLineIds = invoiceLines.filter((line) => !line.superseded_by_extraction_id
      && !ownIds.has(line.interpretation_proposal_id)).map((line) => line.id)
  }

  const supplierId = Number(invoice.supplier_id)
  const [legacyResult, versionsResult, receiptsResult] = await Promise.all([
    db.from('supplier_item_mappings').select('id,supplier_id,supplier_item_name,ingredient_id')
      .eq('supplier_id', supplierId),
    db.from('purchase_mapping_versions')
      .select('id,legacy_mapping_id,supplier_id,supplier_item_name,ingredient_id,conversion_factor,line_billing_unit,line_content_qty,line_content_unit,status,supersedes_id,idempotency_key')
      .eq('supplier_id', supplierId),
    db.from('purchase_receipt_confirmations')
      .select('mapping_version_id,purchase_invoice_line_id').eq('supplier_id', supplierId),
  ])
  if (legacyResult.error || versionsResult.error || receiptsResult.error) throw new Error('mistral_mapping_memory_unavailable')
  const versions = (versionsResult.data ?? []) as VersionRow[]
  const ingredientIds = [...new Set([
    ...(legacyResult.data ?? []).map((row) => row.ingredient_id),
    ...versions.map((row) => row.ingredient_id),
  ].filter((value): value is string => Boolean(value)))]
  const ingredientResult = ingredientIds.length
    ? await db.from('ingredients').select('id,purchase_unit,base_unit').in('id', ingredientIds)
    : { data: [] as IngredientUnitRow[], error: null }
  if (ingredientResult.error) throw new Error('mistral_ingredient_units_unavailable')
  const receiptLineIds = [...new Set((receiptsResult.data ?? [])
    .map((row) => row.purchase_invoice_line_id).filter(Boolean))]
  const receiptLines = receiptLineIds.length
    ? await db.from('purchase_invoice_lines').select('id,interpretation_proposal_id').in('id', receiptLineIds)
    : { data: [], error: null }
  if (receiptLines.error) throw new Error('mistral_confirmed_codes_unavailable')
  const proposalIdByLine = new Map((receiptLines.data ?? [])
    .map((row) => [row.id, row.interpretation_proposal_id]))
  const confirmedProposalIds = [...new Set([...proposalIdByLine.values()].filter(Boolean))]
  const codeProposals = confirmedProposalIds.length
    ? await db.from('purchase_interpretation_proposals').select('id,observed')
      .in('id', confirmedProposalIds)
    : { data: [], error: null }
  if (codeProposals.error) throw new Error('mistral_confirmed_codes_unavailable')
  const observedByProposal = new Map((codeProposals.data ?? []).map((row) => [row.id, row.observed]))
  const observedCodes: ObservedCodeRow[] = (receiptsResult.data ?? []).map((receipt) => ({
    mapping_version_id: receipt.mapping_version_id,
    observed: observedByProposal.get(proposalIdByLine.get(receipt.purchase_invoice_line_id)) ?? null,
  }))
  const memory = buildSupplierMemory({ legacy: (legacyResult.data ?? []) as LegacyMappingRow[],
    versions, ingredients: (ingredientResult.data ?? []) as IngredientUnitRow[],
    observedCodes })
  const assessment = assessDocument({ document: params.canonical, supplierId,
    memory: memory.identities, presentations: memory.presentations })

  const { data: existing, error: existingError } = await db.from('purchase_interpretation_proposals')
    .select('id,source_row_index,supplier_profile_hash,created_at,provenance').eq('document_extraction_id', params.extractionId)
    .eq('normalizer_version', MISTRAL_PIPELINE_VERSION)
    .order('created_at', { ascending: true })
  if (existingError) throw new Error('mistral_proposals_unavailable')
  const possiblePreviousIds = (existing ?? []).map((row) => String(row.id))
  const previousIds = [...new Set(possiblePreviousIds)]
  const successors = previousIds.length
    ? await db.from('purchase_interpretation_proposals')
      .select('supersedes_proposal_id').in('supersedes_proposal_id', previousIds)
    : { data: [], error: null }
  if (successors.error) throw new Error('mistral_prior_revision_lookup_failed')
  const alreadyRevised = new Set((successors.data ?? []).map((row) => row.supersedes_proposal_id))
  const { currentByRow: byRow, previousByRow: previousVersionByRow } = selectReplayProposals(
    (existing ?? []) as Array<{ id: string; source_row_index: number | null;
      supplier_profile_hash: string | null; provenance: unknown }>, PROFILE_HASH, alreadyRevised)
  const { data: supersededRows, error: supersededError } = await db.from('purchase_interpretation_proposals')
    .select('id,source_row_index').eq('document_extraction_id', params.extractionId)
    .eq('normalizer_version', 'mistral-pipeline-v2')
  if (supersededError) throw new Error('mistral_prior_proposals_unavailable')
  const priorByRow = new Map((supersededRows ?? []).map((row) => [Number(row.source_row_index), String(row.id)]))
  for (const [rowIndex, id] of previousVersionByRow) priorByRow.set(rowIndex, id)
  const { data: sharedSet, error: sharedSetError } = await db.from('purchase_interpretation_proposals')
    .select('proposal_set_id').eq('purchase_invoice_id', params.invoiceId)
    .eq('normalizer_version', MISTRAL_PIPELINE_VERSION)
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (sharedSetError) throw new Error('mistral_proposal_set_unavailable')
  const proposalSetId = sharedSet?.proposal_set_id ?? randomUUID()
  let created = 0
  let materialized = 0
  for (const assessmentLine of assessment.lines) {
    const rowIndex = assessmentLine.rowIndex
    const observed = params.canonical.lines[rowIndex]!
    let proposalId = byRow.get(rowIndex)
    if (!proposalId) {
      let mappingVersionId = assessmentLine.mappingVersionId
      const sourceVersion = versions.find((row) => row.id === mappingVersionId)
      const observedName = observed.description_raw.trim()
      const aliasEligible = assessmentLine.status === 'ready_for_review'
        && sourceVersion && assessmentLine.matchScore >= 0.95
        && ['code', 'exact_name', 'alias'].includes(assessmentLine.matchSource)
        && sourceVersion.supplier_item_name.trim().toLocaleLowerCase('es')
          !== observedName.toLocaleLowerCase('es')
      if (aliasEligible && sourceVersion) {
        const key = `mistral-alias-v1:${sourceVersion.id}:${fingerprint(observedName)}`
        const { data: existingAlias, error: aliasLookupError } = await db.from('purchase_mapping_versions')
          .select('id').eq('idempotency_key', key).maybeSingle()
        if (aliasLookupError) throw new Error('mistral_alias_lookup_failed')
        if (existingAlias) mappingVersionId = existingAlias.id
        else {
          const { data: alias, error: aliasError } = await db.from('purchase_mapping_versions')
            .insert({ supplier_id: supplierId, supplier_item_name: observedName,
              ingredient_id: sourceVersion.ingredient_id,
              conversion_factor: sourceVersion.conversion_factor,
              line_billing_unit: sourceVersion.line_billing_unit,
              line_content_qty: sourceVersion.line_content_qty,
              line_content_unit: sourceVersion.line_content_unit,
              source_document_extraction_id: params.extractionId,
              proposed_by: invoice.created_by,
              idempotency_key: key,
              note: `Alias Mistral de la presentación ${sourceVersion.id}; pendiente de K4`,
            }).select('id').single()
          if (aliasError || !alias) throw new Error('mistral_alias_insert_failed')
          mappingVersionId = alias.id
        }
      }
      const mappingPair = proposalMappingPair(assessmentLine.ingredientId, mappingVersionId)
      const payload = {
        proposal_set_id: proposalSetId,
        purchase_invoice_id: params.invoiceId,
        document_extraction_id: params.extractionId,
        supplier_id: supplierId,
        supplier_profile_id: PROFILE_ID,
        supplier_profile_version: PROFILE_VERSION,
        supplier_profile_hash: PROFILE_HASH,
        normalizer_version: MISTRAL_PIPELINE_VERSION,
        source_file_hash: params.sourceHash,
        input_fingerprint: fingerprint([params.extractionId, rowIndex, assessmentLine, observed]),
        source_table_index: observed.page_index ?? 0,
        source_row_index: rowIndex,
        supersedes_proposal_id: priorByRow.get(rowIndex) ?? null,
        source_item_name: observed.description_raw,
        mapping_version_id: mappingPair.mappingVersionId,
        ingredient_id: mappingPair.ingredientId,
        status: assessmentLine.status,
        observed,
        interpreted: { match_source: assessmentLine.matchSource,
          match_score: assessmentLine.matchScore, reasons: assessmentLine.reasons,
          candidate_ingredient_id: assessmentLine.ingredientId,
          alias_source_mapping_version_id: aliasEligible ? sourceVersion?.id : null },
        normalized: assessmentLine.normalized ?? {},
        pricing: { observed_unit_price_raw: observed.unit_price_raw,
          effective_unit_price: assessmentLine.effectiveUnitPrice,
          line_total_raw: observed.line_total_raw },
        proposed_allocations: [],
        review_reasons: assessmentLine.reasons,
        warnings: assessment.documentReasons,
        line_quantity: assessmentLine.economicQuantity ?? assessmentLine.observedQuantity,
        line_unit: memory.presentations.find((row) => row.mappingVersionId === assessmentLine.mappingVersionId)?.lineBillingUnit
          ?? observed.billing_unit_raw,
        observed_unit_price: assessmentLine.effectiveUnitPrice ?? assessmentLine.observedUnitPrice,
        line_total: assessmentLine.observedLineTotal,
        physical_quantity: assessmentLine.normalized?.physicalQuantity ?? null,
        base_unit: assessmentLine.normalized?.baseUnit ?? null,
        purchase_quantity: assessmentLine.normalized?.purchaseQuantity ?? null,
        purchase_unit: assessmentLine.normalized?.purchaseUnit ?? null,
        normalized_unit_price: assessmentLine.normalized?.normalizedUnitPrice ?? null,
        created_by: invoice.created_by,
        provenance: { schema_version: MISTRAL_PIPELINE_VERSION, source: 'mistral_canonical',
          trigger: 'mistral_job_completion', correlation_id: params.correlationId,
          economic_effects: false },
      }
      const { data: inserted, error: insertError } = await db.from('purchase_interpretation_proposals')
        .insert(payload).select('id').single()
      if (insertError || !inserted) throw new Error('mistral_proposal_insert_failed')
      proposalId = inserted.id
      created++
    }
    const { data: line, error: lineError } = await db.from('purchase_invoice_lines')
      .select('id').eq('interpretation_proposal_id', proposalId).maybeSingle()
    if (lineError) throw new Error('mistral_line_lookup_failed')
    if (!line) {
      const linePayload = {
        invoice_id: params.invoiceId,
        interpretation_proposal_id: proposalId,
        original_name: observed.description_raw,
        quantity: assessmentLine.economicQuantity ?? assessmentLine.observedQuantity,
        line_unit: memory.presentations.find((row) => row.mappingVersionId === assessmentLine.mappingVersionId)?.lineBillingUnit
          ?? observed.billing_unit_raw,
        unit_price: assessmentLine.effectiveUnitPrice ?? assessmentLine.observedUnitPrice,
        total_price: assessmentLine.observedLineTotal,
        mapped_ingredient_id: assessmentLine.status === 'ready_for_review' ? assessmentLine.ingredientId : null,
        status: assessmentLine.status === 'ready_for_review' ? 'mapped' : 'pending',
      }
      const priorProposalId = priorByRow.get(rowIndex)
      const { data: priorLine, error: priorLineError } = priorProposalId
        ? await db.from('purchase_invoice_lines').select('id')
          .eq('interpretation_proposal_id', priorProposalId).maybeSingle()
        : { data: null, error: null }
      if (priorLineError) throw new Error('mistral_prior_line_lookup_failed')
      const { error: createLineError } = priorLine
        ? await db.from('purchase_invoice_lines').update(linePayload).eq('id', priorLine.id)
        : await db.from('purchase_invoice_lines').insert(linePayload)
      if (createLineError) throw new Error('mistral_line_insert_failed')
      materialized++
    }
  }
  if (oldLineIds.length) {
    const { error: retireError } = await db.from('purchase_invoice_lines')
      .update({ superseded_by_extraction_id: params.extractionId })
      .in('id', oldLineIds)
    if (retireError) throw new Error('mistral_prior_lines_retire_failed')
  }
  return { created, materialized, ready: assessment.readyCount,
    exceptions: assessment.lines.length - assessment.readyCount }
}
