'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import {
  classifyK5BatchCandidate,
  K2_RECONCILIATION_TRUST_START,
  k5EvidenceIdentity,
  type K5BatchDisposition,
} from '@/lib/albaranes/k5/batch-review'
import { proposalInputFingerprint } from '@/lib/albaranes/k5/normalizer'
import { selectCurrentProposalLineage } from '@/lib/albaranes/k5/proposal-lineage'
import {
  applyReceiptLineAction,
  previewReceiptLineAction,
  type ReceiptPreview,
} from '../receipt-actions'

export type K5BatchReviewRow = {
  proposalId: string
  lineId: string | null
  sourceItemName: string
  ingredientId: string | null
  ingredientName: string | null
  mappingVersionId: string | null
  status: string
  disposition: K5BatchDisposition
  reviewReasons: string[]
  warnings: string[]
  confirmed: boolean
  pendingOrderCount: number
  lineQuantity: number | null
  lineUnit: string | null
  observedUnitPrice: number | null
  lineTotal: number | null
}

export type K5BatchReviewSummary = {
  total: number
  ready: number
  confirmed: number
  exceptions: number
  excluded: number
}

export type K5BatchPreviewItem = {
  proposalId: string
  lineId: string
  mappingVersionId: string
  lineName: string
  ingredientName: string
  fingerprint: string
  preview: ReceiptPreview
}

type ManagerGate =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; message: string }

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

async function requireManager(): Promise<ManagerGate> {
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
    return { ok: false, message: 'Solo manager o administración puede revisar recepciones por lote.' }
  }
  return { ok: true, supabase }
}

async function loadBatchState(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoiceId: string
): Promise<{ rows: K5BatchReviewRow[]; summary: K5BatchReviewSummary }> {
  const { data: invoice, error: invoiceError } = await supabase
    .from('purchase_invoices')
    .select('id,supplier_id')
    .eq('id', invoiceId)
    .maybeSingle()
  if (invoiceError || !invoice) throw new Error('No se pudo abrir este albarán.')

  const { data: proposalRows, error: proposalError } = await supabase
    .from('purchase_interpretation_proposals')
    .select('id,proposal_set_id,supersedes_proposal_id,provenance,created_at,document_extraction_id,source_table_index,source_row_index,source_item_name,mapping_version_id,ingredient_id,status,review_reasons,warnings,line_quantity,line_unit,observed_unit_price,line_total')
    .eq('purchase_invoice_id', invoiceId)
    .order('created_at', { ascending: true })
  if (proposalError) throw new Error('No se pudieron leer las propuestas K5.')

  const allProposals = (proposalRows ?? []) as Array<Record<string, unknown>>
  const active = selectCurrentProposalLineage(allProposals)
  const proposalById = new Map(allProposals.map((row) => [text(row.id), row]))

  // Una línea económica ya confirmada no puede cambiar su proposal_id por una
  // recalculación posterior. Por eso resolvemos la línea recorriendo también
  // los ancestros de la propuesta actual; así una nueva interpretación nunca
  // hace que una recepción ya aplicada reaparezca como pendiente.
  const { data: lineRows, error: lineError } = await supabase
    .from('purchase_invoice_lines')
    .select('id,interpretation_proposal_id')
    .eq('invoice_id', invoiceId)
  if (lineError) throw new Error('No se pudieron resolver las líneas revisables.')
  const invoiceLines = (lineRows ?? []) as Array<Record<string, unknown>>
  const lineByProposal = new Map(
    invoiceLines.map((row) => [text(row.interpretation_proposal_id), text(row.id)])
  )
  const proposalByLineId = new Map(
    invoiceLines.map((row) => [text(row.id), text(row.interpretation_proposal_id)])
  )

  function lineIdForProposal(proposalId: string): string | null {
    let cursor = proposalId
    const seen = new Set<string>()
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor)
      const direct = lineByProposal.get(cursor)
      if (direct) return direct
      const parent = proposalById.get(cursor)
      cursor = text(parent?.supersedes_proposal_id)
    }
    return null
  }

  // Se consultan TODAS las líneas del albarán, no solo la línea enlazada a la
  // propuesta activa. Durante la puesta en marcha hubo recalculaciones que
  // crearon una segunda purchase_invoice_line para la misma fila Docling.
  const allInvoiceLineIds = invoiceLines.map((row) => text(row.id)).filter(Boolean)
  const { data: confirmations, error: confirmationError } = allInvoiceLineIds.length
    ? await supabase
        .from('purchase_receipt_confirmations')
        .select('purchase_invoice_line_id')
        .in('purchase_invoice_line_id', allInvoiceLineIds)
    : { data: [] as Array<Record<string, unknown>>, error: null }
  if (confirmationError) throw new Error('No se pudo comprobar qué líneas ya están confirmadas.')
  const confirmedLineIds = new Set(
    ((confirmations ?? []) as Array<Record<string, unknown>>).map((row) => text(row.purchase_invoice_line_id)).filter(Boolean)
  )

  // Una confirmación económica pertenece a la evidencia física de Docling,
  // no al registro accidental de purchase_invoice_lines. Si otra línea apunta
  // a la misma extracción/tabla/fila, se considera ya recibida y nunca puede
  // reaparecer en el lote.
  const confirmedEvidence = new Set<string>()
  for (const lineId of confirmedLineIds) {
    const proposalId = proposalByLineId.get(lineId)
    const proposal = proposalId ? proposalById.get(proposalId) : null
    const identity = proposal
      ? k5EvidenceIdentity({
          documentExtractionId: proposal.document_extraction_id,
          sourceTableIndex: proposal.source_table_index,
          sourceRowIndex: proposal.source_row_index,
        })
      : null
    if (identity) confirmedEvidence.add(identity)
  }

  const ingredientIds = [...new Set(active.map((row) => text(row.ingredient_id)).filter(Boolean))]
  const { data: ingredients, error: ingredientError } = ingredientIds.length
    ? await supabase.from('ingredients').select('id,name').in('id', ingredientIds)
    : { data: [] as Array<Record<string, unknown>>, error: null }
  if (ingredientError) throw new Error('No se pudieron cargar los ingredientes revisados.')
  const ingredientNameById = new Map(
    ((ingredients ?? []) as Array<Record<string, unknown>>).map((row) => [text(row.id), text(row.name)])
  )

  // Los pedidos anteriores a K2 no tienen una historia de recepciones fiable:
  // quedaron abiertos al migrar y bloquearían indefinidamente albaranes nuevos.
  // Solo los pedidos creados ya dentro de la era K2 pueden exigir conciliación.
  const supplierId = text(invoice.supplier_id)
  const { data: trustedOrders, error: trustedOrderError } = ingredientIds.length && supplierId
    ? await supabase
        .from('purchase_orders')
        .select('id')
        .eq('supplier_id', supplierId)
        .gte('created_at', K2_RECONCILIATION_TRUST_START)
    : { data: [] as Array<Record<string, unknown>>, error: null }
  if (trustedOrderError) throw new Error('No se pudo comprobar el periodo fiable de conciliación.')
  const trustedOrderIds = ((trustedOrders ?? []) as Array<Record<string, unknown>>).map((row) => text(row.id)).filter(Boolean)

  const { data: pendingOrders, error: orderError } = ingredientIds.length && trustedOrderIds.length
    ? await supabase
        .from('purchase_order_item_reconciliation')
        .select('ingredient_id,purchase_order_item_id,purchase_order_id')
        .in('ingredient_id', ingredientIds)
        .in('purchase_order_id', trustedOrderIds)
        .gt('quantity_pending', 0)
    : { data: [] as Array<Record<string, unknown>>, error: null }
  if (orderError) throw new Error('No se pudo comprobar la conciliación con pedidos.')
  const pendingOrderCount = new Map<string, number>()
  for (const row of (pendingOrders ?? []) as Array<Record<string, unknown>>) {
    const ingredientId = text(row.ingredient_id)
    if (!ingredientId) continue
    pendingOrderCount.set(ingredientId, (pendingOrderCount.get(ingredientId) ?? 0) + 1)
  }

  const rows = active
    .map((proposal): K5BatchReviewRow => {
      const proposalId = text(proposal.id)
      const lineId = lineIdForProposal(proposalId)
      const ingredientId = text(proposal.ingredient_id) || null
      const evidenceIdentity = k5EvidenceIdentity({
        documentExtractionId: proposal.document_extraction_id,
        sourceTableIndex: proposal.source_table_index,
        sourceRowIndex: proposal.source_row_index,
      })
      const confirmed = Boolean(
        (lineId && confirmedLineIds.has(lineId))
        || (evidenceIdentity && confirmedEvidence.has(evidenceIdentity))
      )
      const pending = ingredientId ? pendingOrderCount.get(ingredientId) ?? 0 : 0
      const status = text(proposal.status)
      const mappingVersionId = text(proposal.mapping_version_id) || null
      const disposition = classifyK5BatchCandidate({
        status,
        mappingVersionId,
        ingredientId,
        lineId,
        confirmed,
        pendingOrderCount: pending,
      })

      return {
        proposalId,
        lineId,
        sourceItemName: text(proposal.source_item_name) || 'Fila sin producto',
        ingredientId,
        ingredientName: ingredientId ? ingredientNameById.get(ingredientId) || null : null,
        mappingVersionId,
        status,
        disposition,
        reviewReasons: Array.isArray(proposal.review_reasons) ? proposal.review_reasons.map(text).filter(Boolean) : [],
        warnings: Array.isArray(proposal.warnings) ? proposal.warnings.map(text).filter(Boolean) : [],
        confirmed,
        pendingOrderCount: pending,
        lineQuantity: numberOrNull(proposal.line_quantity),
        lineUnit: text(proposal.line_unit) || null,
        observedUnitPrice: numberOrNull(proposal.observed_unit_price),
        lineTotal: numberOrNull(proposal.line_total),
      }
    })
    .sort((a, b) => a.sourceItemName.localeCompare(b.sourceItemName, 'es'))

  const summary: K5BatchReviewSummary = {
    total: rows.length,
    ready: rows.filter((row) => row.disposition === 'ready').length,
    confirmed: rows.filter((row) => row.disposition === 'confirmed').length,
    exceptions: rows.filter((row) => ['needs_mapping', 'needs_review', 'order_review', 'unavailable'].includes(row.disposition)).length,
    excluded: rows.filter((row) => row.disposition === 'excluded').length,
  }

  return { rows, summary }
}

function previewFingerprint(row: K5BatchReviewRow, preview: ReceiptPreview): string {
  return proposalInputFingerprint({
    schema: 'k5-batch-preview-v1',
    proposal_id: row.proposalId,
    line_id: row.lineId,
    mapping_version_id: row.mappingVersionId,
    ingredient_id: preview.ingredient_id,
    physical_quantity: preview.physical_quantity,
    base_unit: preview.base_unit,
    purchase_quantity: preview.purchase_quantity,
    purchase_unit: preview.purchase_unit,
    observed_unit_price: preview.observed_unit_price,
    normalized_unit_price: preview.normalized_unit_price,
    price_before: preview.price_before,
    price_after: preview.price_after,
    price_locked: preview.price_locked,
    price_changed: preview.price_changed,
    allocation_count: preview.allocation_count,
  })
}

export async function listK5BatchReviewAction(params: { invoiceId: string }): Promise<
  | { success: true; rows: K5BatchReviewRow[]; summary: K5BatchReviewSummary }
  | { success: false; message: string }
> {
  const gate = await requireManager()
  if (!gate.ok) return { success: false, message: gate.message }
  const invoiceId = text(params?.invoiceId)
  if (!invoiceId) return { success: false, message: 'Albarán inválido.' }
  try {
    const state = await loadBatchState(gate.supabase, invoiceId)
    return { success: true, ...state }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'No se pudo preparar la revisión por lote.' }
  }
}


export async function prepareK5ManualReviewLineAction(params: {
  invoiceId: string
  proposalId: string
}): Promise<
  | { success: true; lineId: string; existing: boolean }
  | { success: false; message: string }
> {
  const gate = await requireManager()
  if (!gate.ok) return { success: false, message: gate.message }

  const invoiceId = text(params?.invoiceId)
  const proposalId = text(params?.proposalId)
  if (!invoiceId || !proposalId) return { success: false, message: 'La excepción K5 no es válida.' }

  let state: Awaited<ReturnType<typeof loadBatchState>>
  try {
    state = await loadBatchState(gate.supabase, invoiceId)
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'No se pudo preparar la revisión manual.' }
  }

  const row = state.rows.find((item) => item.proposalId === proposalId)
  if (!row) return { success: false, message: 'Esta propuesta ya no es la revisión K5 activa. Recarga la pantalla.' }
  if (row.lineId) return { success: true, lineId: row.lineId, existing: true }
  if (!['needs_mapping', 'needs_review', 'unavailable'].includes(row.disposition)) {
    return { success: false, message: 'Esta línea ya no necesita una preparación manual.' }
  }

  const { data: proposal, error: proposalError } = await gate.supabase
    .from('purchase_interpretation_proposals')
    .select('id,purchase_invoice_id,source_item_name,line_quantity,line_unit,observed_unit_price,line_total,status')
    .eq('id', proposalId)
    .eq('purchase_invoice_id', invoiceId)
    .maybeSingle()
  if (proposalError || !proposal) {
    return { success: false, message: 'No se pudo cargar la evidencia de esta excepción.' }
  }

  const originalName = text(proposal.source_item_name) || 'Producto pendiente de identificar'
  const payload = {
    invoice_id: invoiceId,
    interpretation_proposal_id: proposalId,
    original_name: originalName,
    quantity: proposal.line_quantity,
    line_unit: text(proposal.line_unit) || null,
    unit_price: proposal.observed_unit_price,
    total_price: proposal.line_total,
    mapped_ingredient_id: null,
    status: 'pending',
  }

  const { data: inserted, error: insertError } = await gate.supabase
    .from('purchase_invoice_lines')
    .insert(payload)
    .select('id')
    .maybeSingle()

  if (insertError || !inserted?.id) {
    const { data: existing } = await gate.supabase
      .from('purchase_invoice_lines')
      .select('id')
      .eq('invoice_id', invoiceId)
      .eq('interpretation_proposal_id', proposalId)
      .maybeSingle()
    if (existing?.id) return { success: true, lineId: text(existing.id), existing: true }
    return { success: false, message: 'No se pudo crear la línea manual para esta excepción.' }
  }

  revalidatePath('/dashboard/albaranes')
  revalidatePath('/dashboard/albaranes/k5')
  return { success: true, lineId: text(inserted.id), existing: false }
}

export async function previewK5BatchReceiptsAction(params: {
  invoiceId: string
  proposalIds: string[]
}): Promise<
  | { success: true; items: K5BatchPreviewItem[] }
  | { success: false; message: string }
> {
  const gate = await requireManager()
  if (!gate.ok) return { success: false, message: gate.message }
  const invoiceId = text(params?.invoiceId)
  const proposalIds = [...new Set((params?.proposalIds ?? []).map(text).filter(Boolean))]
  if (!invoiceId || proposalIds.length === 0) return { success: false, message: 'Selecciona al menos una línea lista.' }
  if (proposalIds.length > 80) return { success: false, message: 'El lote es demasiado grande. Divide la revisión.' }

  let state: Awaited<ReturnType<typeof loadBatchState>>
  try {
    state = await loadBatchState(gate.supabase, invoiceId)
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'No se pudo validar el lote.' }
  }
  const byId = new Map(state.rows.map((row) => [row.proposalId, row]))
  const selected = proposalIds.map((id) => byId.get(id)).filter((row): row is K5BatchReviewRow => Boolean(row))
  if (selected.length !== proposalIds.length || selected.some((row) => row.disposition !== 'ready' || !row.lineId || !row.mappingVersionId)) {
    return { success: false, message: 'Alguna línea ya no está lista para confirmación automática. Actualiza la revisión.' }
  }

  const items: K5BatchPreviewItem[] = []
  for (const row of selected) {
    const result = await previewReceiptLineAction({
      lineId: row.lineId!,
      mappingVersionId: row.mappingVersionId!,
      allocations: [],
    })
    if (!result.success) {
      return { success: false, message: `${row.sourceItemName}: ${result.message}` }
    }
    items.push({
      proposalId: row.proposalId,
      lineId: row.lineId!,
      mappingVersionId: row.mappingVersionId!,
      lineName: row.sourceItemName,
      ingredientName: row.ingredientName || result.preview.ingredient_name,
      fingerprint: previewFingerprint(row, result.preview),
      preview: result.preview,
    })
  }

  return { success: true, items }
}

export async function applyK5BatchReceiptsAction(params: {
  invoiceId: string
  items: Array<{ proposalId: string; fingerprint: string }>
  idempotencyKey: string
}): Promise<
  | { success: true; applied: number }
  | { success: false; message: string; applied: number }
> {
  const gate = await requireManager()
  if (!gate.ok) return { success: false, message: gate.message, applied: 0 }
  const invoiceId = text(params?.invoiceId)
  const batchKey = text(params?.idempotencyKey)
  const requested = (params?.items ?? [])
    .map((item) => ({ proposalId: text(item.proposalId), fingerprint: text(item.fingerprint) }))
    .filter((item) => item.proposalId && item.fingerprint)
  const uniqueIds = new Set(requested.map((item) => item.proposalId))
  if (!invoiceId || !batchKey || requested.length === 0 || uniqueIds.size !== requested.length) {
    return { success: false, message: 'El lote de confirmación no es válido.', applied: 0 }
  }
  if (requested.length > 80) return { success: false, message: 'El lote es demasiado grande.', applied: 0 }

  let state: Awaited<ReturnType<typeof loadBatchState>>
  try {
    state = await loadBatchState(gate.supabase, invoiceId)
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'No se pudo revalidar el lote.', applied: 0 }
  }
  const byId = new Map(state.rows.map((row) => [row.proposalId, row]))

  const validated: Array<{ row: K5BatchReviewRow; fingerprint: string }> = []
  for (const request of requested) {
    const row = byId.get(request.proposalId)
    if (!row || row.disposition !== 'ready' || !row.lineId || !row.mappingVersionId) {
      return { success: false, message: 'El lote cambió desde la vista previa. No se confirmó ninguna línea nueva.', applied: 0 }
    }
    const previewResult = await previewReceiptLineAction({
      lineId: row.lineId,
      mappingVersionId: row.mappingVersionId,
      allocations: [],
    })
    if (!previewResult.success) {
      return { success: false, message: `${row.sourceItemName}: ${previewResult.message}`, applied: 0 }
    }
    if (previewFingerprint(row, previewResult.preview) !== request.fingerprint) {
      return { success: false, message: `${row.sourceItemName}: el efecto cambió desde la vista previa. Revisa de nuevo el lote.`, applied: 0 }
    }
    validated.push({ row, fingerprint: request.fingerprint })
  }

  let applied = 0
  for (const { row } of validated) {
    const result = await applyReceiptLineAction({
      lineId: row.lineId!,
      mappingVersionId: row.mappingVersionId!,
      allocations: [],
      idempotencyKey: `receipt-batch:${batchKey}:${row.proposalId}`,
    })
    if (!result.success) {
      revalidatePath('/dashboard/albaranes')
      revalidatePath('/dashboard/albaranes/k5')
      return {
        success: false,
        message: applied > 0
          ? `${row.sourceItemName}: no se pudo confirmar. ${applied} línea(s) anteriores sí quedaron confirmadas de forma idempotente.`
          : `${row.sourceItemName}: ${result.message}`,
        applied,
      }
    }
    applied += 1
  }

  revalidatePath('/dashboard/albaranes')
  revalidatePath('/dashboard/albaranes/k5')
  revalidatePath('/dashboard/inventory')
  revalidatePath('/dashboard/inventory/ledger')
  return { success: true, applied }
}
