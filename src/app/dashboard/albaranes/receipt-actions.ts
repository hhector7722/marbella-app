'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { compareExact, parseExactDecimal } from '@/lib/albaranes/k5/exact-decimal'
import { buildExactMappedSnapshot } from '@/lib/albaranes/k5/mapped-snapshot'
import { K5_NORMALIZER_VERSION, proposalInputFingerprint } from '@/lib/albaranes/k5/normalizer'
import { deriveVariableWeightEvidence } from '@/lib/albaranes/k5/variable-weight'

export type ReceiptAllocationInput = {
  purchase_order_item_id: string
  quantity_in_order_unit: number
  quantity_in_invoice_line_unit: number
}

export type ReceiptPreview = {
  ok: true
  preview: true
  line_name: string
  ingredient_id: string
  ingredient_name: string
  mapping_version_id: string
  mapping_will_be_confirmed: boolean
  line_billing_unit: string
  line_content_qty: number
  line_content_unit: string
  conversion_factor: number
  physical_quantity: number
  base_unit: string
  purchase_quantity: number
  purchase_unit: string
  observed_unit_price: number
  normalized_unit_price: number
  price_before: number
  price_after: number
  price_locked: boolean
  price_changed: boolean
  allocation_count: number
  interpretation_proposal_id?: string
  proposal_validated?: boolean
}

export type ReceiptApplyResult =
  | ({ ok: true; idempotent: boolean; confirmation_id: string; stock_movement_id: string } & Record<string, unknown>)
  | { ok: false; code: string; message: string }

async function requirePurchaseManager() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, message: 'Inicia sesión para continuar.', supabase: null, userId: null }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (error || (profile?.role !== 'manager' && profile?.role !== 'admin')) {
    return {
      ok: false as const,
      message: 'Solo manager o administración puede preparar o confirmar una recepción.',
      supabase: null,
      userId: null,
    }
  }
  return { ok: true as const, supabase, userId: user.id }
}

function decimal(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function sameExactDecimal(left: unknown, right: unknown): boolean {
  const a = parseExactDecimal(text(left))
  const b = parseExactDecimal(text(right))
  return Boolean(a && b && compareExact(a, b) === 0)
}

async function interpretationProposalIdForLine(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lineId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('purchase_invoice_lines')
    .select('interpretation_proposal_id')
    .eq('id', lineId)
    .maybeSingle()
  if (error) throw new Error('No se pudo comprobar la propuesta de interpretación de la línea.')
  return text(data?.interpretation_proposal_id) || null
}

type K5MappingRevision = {
  id: string
  status: 'ready_for_review' | 'needs_review'
}

async function supersedeK5ProposalWithMapping(params: {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  line: Record<string, unknown>
  mappingVersionId: string
  ingredientId: string
  conversionFactor: number
  lineBillingUnit: string
  lineContentQty: number
  lineContentUnit: string
  variableWeightKg?: number | null
  variablePieceCount?: number | null
}): Promise<K5MappingRevision | null> {
  const currentProposalId = text(params.line.interpretation_proposal_id)
  if (!currentProposalId) return null

  const { data: current, error: currentError } = await params.supabase
    .from('purchase_interpretation_proposals')
    .select('*')
    .eq('id', currentProposalId)
    .maybeSingle()
  if (currentError || !current) throw new Error('No se pudo leer la propuesta K5 vinculada a la línea.')

  const { data: successor, error: successorError } = await params.supabase
    .from('purchase_interpretation_proposals')
    .select('id,mapping_version_id,status')
    .eq('supersedes_proposal_id', currentProposalId)
    .limit(1)
    .maybeSingle()
  if (successorError) throw new Error('No se pudo comprobar si la propuesta K5 ya fue revisada.')
  if (successor?.id) {
    if (text(successor.mapping_version_id) !== params.mappingVersionId) {
      throw new Error('La propuesta ya tiene una revisión posterior distinta. Vuelve a abrir el albarán.')
    }
    const successorStatus = text(successor.status)
    if (successorStatus !== 'ready_for_review' && successorStatus !== 'needs_review') {
      throw new Error('La revisión K5 existente no tiene un estado confirmable de mapeo.')
    }
    return { id: text(successor.id), status: successorStatus }
  }

  const { data: ingredient, error: ingredientError } = await params.supabase
    .from('ingredients')
    .select('purchase_unit,base_unit')
    .eq('id', params.ingredientId)
    .maybeSingle()
  if (ingredientError || !ingredient?.purchase_unit || !ingredient?.base_unit) {
    throw new Error('El ingrediente no tiene unidades canónicas completas.')
  }

  const lineName = text(params.line.original_name)
  const hasResolvedName = Boolean(lineName && lineName !== 'Producto pendiente de identificar')
  const lineQuantity = text(params.line.quantity) || text(current.line_quantity)
  const observedUnitPrice = text(params.line.unit_price) || text(current.observed_unit_price)
  const lineTotal = text(params.line.total_price) || text(current.line_total)
  const quantityNumber = decimal(lineQuantity)
  const unitPriceNumber = decimal(observedUnitPrice)
  const lineTotalNumber = decimal(lineTotal)
  const humanLineOverride = Boolean(
    hasResolvedName
    && (
      lineName !== text(current.source_item_name)
      || lineQuantity !== text(current.line_quantity)
      || observedUnitPrice !== text(current.observed_unit_price)
      || lineTotal !== text(current.line_total)
    )
  )

  const snapshot = buildExactMappedSnapshot({
    lineQuantity,
    observedUnitPrice,
    mapping: {
      conversionFactor: String(params.conversionFactor),
      lineContentQty: String(params.lineContentQty),
      lineContentUnit: params.lineContentUnit,
      purchaseUnit: text(ingredient.purchase_unit),
      baseUnit: text(ingredient.base_unit),
    },
  })

  const previousReasons: string[] = Array.isArray(current.review_reasons)
    ? (current.review_reasons as unknown[]).map(text).filter(Boolean)
    : []
  // La revisión humana puede completar datos que Docling dejó vacíos. Esos
  // valores quedan versionados en la propuesta sucesora; la evidencia original
  // no se modifica y K4 seguirá revalidando antes de cualquier efecto económico.
  const semanticReasons = previousReasons.filter((reason: string) => {
    if ([
      'mapping_missing',
      'mapping_presentation_incompatible',
      'price_not_normalizable',
      'unknown_quantity_unit',
    ].includes(reason)) return false
    if (['missing_product', 'product_missing'].includes(reason) && hasResolvedName) return false
    if (reason === 'missing_quantity' && quantityNumber != null && quantityNumber > 0) return false
    if (reason === 'missing_unit_price' && unitPriceNumber != null && unitPriceNumber > 0) return false
    if (reason === 'missing_line_amount' && lineTotalNumber != null && lineTotalNumber > 0) return false
    if (snapshot && ['mixed_measurement_requires_review', 'unsupported_presentation'].includes(reason)) return false
    if (
      snapshot
      && humanLineOverride
      && ['discount_not_interpretable', 'discount_requires_review', 'line_amount_mismatch'].includes(reason)
    ) return false
    return true
  })
  const reviewReasons: string[] = snapshot
    ? semanticReasons
    : [...semanticReasons, 'mapping_presentation_incompatible']
  const status: K5MappingRevision['status'] = snapshot && reviewReasons.length === 0
    ? 'ready_for_review'
    : 'needs_review'

  const normalized = snapshot
    ? {
        physical_quantity: snapshot.physicalQuantity,
        base_unit: snapshot.baseUnit,
        purchase_quantity: snapshot.purchaseQuantity,
        purchase_unit: snapshot.purchaseUnit,
        normalized_unit_price: snapshot.normalizedUnitPrice,
      }
    : {}

  const fingerprint = proposalInputFingerprint({
    previous_proposal_id: currentProposalId,
    mapping_version_id: params.mappingVersionId,
    ingredient_id: params.ingredientId,
    normalized,
    status,
    review_reasons: reviewReasons,
    warnings: current.warnings ?? [],
    line_quantity: lineQuantity,
    line_unit: params.lineBillingUnit,
    observed_unit_price: observedUnitPrice,
    line_total: lineTotal,
    physical_quantity: snapshot?.physicalQuantity ?? null,
    base_unit: snapshot?.baseUnit ?? null,
    purchase_quantity: snapshot?.purchaseQuantity ?? null,
    purchase_unit: snapshot?.purchaseUnit ?? null,
    normalized_unit_price: snapshot?.normalizedUnitPrice ?? null,
  })

  const { data: existing, error: existingError } = await params.supabase
    .from('purchase_interpretation_proposals')
    .select('id,status')
    .eq('input_fingerprint', fingerprint)
    .maybeSingle()
  if (existingError) throw new Error('No se pudo comprobar la revisión K5 del mapeo.')
  if (existing?.id) {
    const existingStatus = text(existing.status)
    if (existingStatus !== 'ready_for_review' && existingStatus !== 'needs_review') {
      throw new Error('La revisión K5 idempotente tiene un estado inesperado.')
    }
    return { id: text(existing.id), status: existingStatus }
  }

  const { data: inserted, error: insertError } = await params.supabase
    .from('purchase_interpretation_proposals')
    .insert({
      proposal_set_id: crypto.randomUUID(),
      purchase_invoice_id: current.purchase_invoice_id,
      document_extraction_id: current.document_extraction_id,
      supplier_id: current.supplier_id,
      supplier_profile_id: current.supplier_profile_id,
      supplier_profile_version: current.supplier_profile_version,
      supplier_profile_hash: current.supplier_profile_hash,
      normalizer_version: text(current.normalizer_version) || K5_NORMALIZER_VERSION,
      source_file_hash: current.source_file_hash,
      input_fingerprint: fingerprint,
      source_table_index: current.source_table_index,
      source_row_index: current.source_row_index,
      source_item_name: hasResolvedName ? lineName : current.source_item_name,
      mapping_version_id: params.mappingVersionId,
      ingredient_id: params.ingredientId,
      status,
      observed: current.observed ?? {},
      interpreted: current.interpreted ?? {},
      normalized,
      pricing: current.pricing ?? {},
      proposed_allocations: current.proposed_allocations ?? [],
      review_reasons: reviewReasons,
      warnings: current.warnings ?? [],
      line_quantity: lineQuantity,
      line_unit: params.lineBillingUnit,
      observed_unit_price: observedUnitPrice,
      line_total: lineTotal,
      physical_quantity: snapshot?.physicalQuantity ?? null,
      base_unit: snapshot?.baseUnit ?? null,
      purchase_quantity: snapshot?.purchaseQuantity ?? null,
      purchase_unit: snapshot?.purchaseUnit ?? null,
      normalized_unit_price: snapshot?.normalizedUnitPrice ?? null,
      supersedes_proposal_id: currentProposalId,
      created_by: params.userId,
      provenance: {
        ...(current.provenance && typeof current.provenance === 'object' ? current.provenance : {}),
        revision: 'human_mapping_selection',
        manual_line_override: humanLineOverride,
        ...(params.variableWeightKg != null
          ? {
              variable_weight_kg: params.variableWeightKg,
              variable_piece_count: params.variablePieceCount ?? null,
            }
          : {}),
        economic_effects: false,
      },
    })
    .select('id,status')
    .maybeSingle()
  if (insertError || !inserted?.id) throw new Error('No se pudo versionar la propuesta K5 con el mapeo revisado.')
  return { id: text(inserted.id), status }
}

/**
 * Prepara una propuesta de mapeo immutable. No toca precio, stock, histórico
 * ni conciliación: esos hechos pertenecen exclusivamente a apply_receipt_line.
 */
export async function saveReceiptMappingProposalAction(params: {
  invoiceId: string
  lineId: string
  ingredientId: string
  conversionFactor: number
  lineBillingUnit: string
  lineContentQty: number
  lineContentUnit: string
}): Promise<{ success: true; mappingVersionId: string } | { success: false; message: string }> {
  const gate = await requirePurchaseManager()
  if (!gate.ok) return { success: false, message: gate.message }

  const invoiceId = text(params?.invoiceId)
  const lineId = text(params?.lineId)
  const ingredientId = text(params?.ingredientId)
  const conversionFactor = decimal(params?.conversionFactor)
  const lineBillingUnit = text(params?.lineBillingUnit)
  const lineContentQty = decimal(params?.lineContentQty)
  const lineContentUnit = text(params?.lineContentUnit)
  if (!invoiceId || !lineId || !ingredientId || conversionFactor == null || conversionFactor <= 0) {
    return { success: false, message: 'Faltan el ingrediente o el factor de conversión válido.' }
  }
  if (!lineBillingUnit || lineContentQty == null || lineContentQty <= 0 || !lineContentUnit) {
    return { success: false, message: 'Indica la presentación completa: unidad facturada, contenido y su unidad.' }
  }

  const { data: line, error: lineError } = await gate.supabase
    .from('purchase_invoice_lines')
    .select('id,invoice_id,original_name,quantity,unit_price,total_price,line_unit,interpretation_proposal_id')
    .eq('id', lineId)
    .maybeSingle()
  if (lineError || !line || line.invoice_id !== invoiceId || !text(line.original_name)) {
    return { success: false, message: 'No se encontró la línea revisable de este albarán.' }
  }

  const k5ProposalId = text(line.interpretation_proposal_id)
  if (k5ProposalId && text(line.original_name) === 'Producto pendiente de identificar') {
    return { success: false, message: 'Completa primero el nombre real del producto.' }
  }
  if (
    k5ProposalId
    && (
      decimal(line.quantity) == null
      || decimal(line.quantity)! <= 0
      || decimal(line.unit_price) == null
      || decimal(line.unit_price)! <= 0
    )
  ) {
    return { success: false, message: 'Completa primero cantidad y precio unitario antes de mapear.' }
  }

  let effectiveConversionFactor = conversionFactor
  let effectiveLineBillingUnit = lineBillingUnit
  let effectiveLineContentQty = lineContentQty
  let effectiveLineContentUnit = lineContentUnit
  let variableWeightKg: number | null = null
  let variablePieceCount: number | null = null

  if (k5ProposalId) {
    const [{ data: proposalForWeight }, { data: ingredientForWeight }] = await Promise.all([
      gate.supabase
        .from('purchase_interpretation_proposals')
        .select('observed,observed_unit_price,line_total')
        .eq('id', k5ProposalId)
        .maybeSingle(),
      gate.supabase
        .from('ingredients')
        .select('purchase_unit')
        .eq('id', ingredientId)
        .maybeSingle(),
    ])
    const rawCells = Array.isArray((proposalForWeight as any)?.observed?.raw_cells)
      ? (proposalForWeight as any).observed.raw_cells
      : []
    const variable = deriveVariableWeightEvidence({
      rawCells,
      unitPrice: (proposalForWeight as any)?.observed_unit_price ?? line.unit_price,
      lineTotal: (proposalForWeight as any)?.line_total ?? line.total_price,
    })
    if (variable && text((ingredientForWeight as any)?.purchase_unit).toLowerCase() === 'kg') {
      variableWeightKg = variable.weightKg
      variablePieceCount = variable.pieceCount
      effectiveConversionFactor = 1
      effectiveLineBillingUnit = 'kg'
      effectiveLineContentQty = 1
      effectiveLineContentUnit = 'kg'
    }
  }

  const { data: invoice, error: invoiceError } = await gate.supabase
    .from('purchase_invoices')
    .select('supplier_id')
    .eq('id', invoiceId)
    .maybeSingle()
  const supplierId = invoice?.supplier_id ?? null
  if (invoiceError || supplierId == null) {
    return { success: false, message: 'Asigna un proveedor antes de preparar el mapeo.' }
  }

  const { data: legacyMapping, error: legacyError } = await gate.supabase
    .from('supplier_item_mappings')
    .upsert(
      {
        supplier_id: supplierId,
        supplier_item_name: line.original_name,
        ingredient_id: ingredientId,
        conversion_factor: effectiveConversionFactor,
        line_billing_unit: effectiveLineBillingUnit,
        line_content_qty: effectiveLineContentQty,
        line_content_unit: effectiveLineContentUnit,
        last_known_price: line.unit_price,
      },
      { onConflict: 'supplier_id,supplier_item_name' }
    )
    .select('id')
    .maybeSingle()
  if (legacyError) return { success: false, message: 'No se pudo guardar la propuesta de producto del proveedor.' }

  // No se selecciona "latest". La versión activa es la hoja del grafo de
  // supersesión; si hay más de una hoja, la ambigüedad se detiene.
  const { data: versionRows, error: versionError } = await gate.supabase
    .from('purchase_mapping_versions')
    .select('id,ingredient_id,conversion_factor,line_billing_unit,line_content_qty,line_content_unit,status,supersedes_id')
    .eq('supplier_id', supplierId)
    .ilike('supplier_item_name', line.original_name)
  if (versionError) return { success: false, message: 'No se pudieron leer las versiones de mapeo.' }

  const versions = versionRows ?? []
  const superseded = new Set(versions.map((row) => text(row.supersedes_id)).filter(Boolean))
  const active = versions.filter((row) => !superseded.has(text(row.id)))
  if (active.length > 1) {
    return { success: false, message: 'Hay más de una versión activa de mapeo. Requiere revisión antes de continuar.' }
  }
  const current = active[0] ?? null

  const unchanged =
    current &&
    current.status !== 'rejected' &&
    current.ingredient_id === ingredientId &&
    sameExactDecimal(current.conversion_factor, effectiveConversionFactor) &&
    text(current.line_billing_unit).toLowerCase() === effectiveLineBillingUnit.toLowerCase() &&
    sameExactDecimal(current.line_content_qty, effectiveLineContentQty) &&
    text(current.line_content_unit).toLowerCase() === effectiveLineContentUnit.toLowerCase()

  let mappingVersionId = current?.id ?? null
  if (!unchanged) {
    const { data: inserted, error: insertError } = await gate.supabase
      .from('purchase_mapping_versions')
      .insert({
        legacy_mapping_id: legacyMapping?.id ?? null,
        supplier_id: supplierId,
        supplier_item_name: line.original_name,
        ingredient_id: ingredientId,
        conversion_factor: effectiveConversionFactor,
        line_billing_unit: effectiveLineBillingUnit,
        line_content_qty: effectiveLineContentQty,
        line_content_unit: effectiveLineContentUnit,
        status: 'proposed',
        supersedes_id: current?.id ?? null,
        idempotency_key: `mapping-proposal:${lineId}:${crypto.randomUUID()}`,
        proposed_by: gate.userId,
        note: 'Propuesta revisada desde la línea de albarán',
      })
      .select('id')
      .maybeSingle()
    if (insertError || !inserted?.id) {
      return { success: false, message: 'No se pudo versionar la propuesta de mapeo.' }
    }
    mappingVersionId = inserted.id
  }

  if (!mappingVersionId) return { success: false, message: 'No se pudo resolver la versión de mapeo.' }

  let revisedProposal: K5MappingRevision | null = null
  try {
    revisedProposal = await supersedeK5ProposalWithMapping({
      supabase: gate.supabase,
      userId: gate.userId,
      line: {
        ...(line as unknown as Record<string, unknown>),
        ...(variableWeightKg != null ? { quantity: variableWeightKg, line_unit: 'kg' } : {}),
      },
      mappingVersionId,
      ingredientId,
      conversionFactor: effectiveConversionFactor,
      lineBillingUnit: effectiveLineBillingUnit,
      lineContentQty: effectiveLineContentQty,
      lineContentUnit: effectiveLineContentUnit,
      variableWeightKg,
      variablePieceCount,
    })
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'No se pudo revisar la propuesta K5.' }
  }

  const { error: updateError } = await gate.supabase
    .from('purchase_invoice_lines')
    .update({
      mapped_ingredient_id: ingredientId,
      status: revisedProposal ? (revisedProposal.status === 'ready_for_review' ? 'mapped' : 'pending') : 'mapped',
      ...(revisedProposal ? { interpretation_proposal_id: revisedProposal.id } : {}),
      ...(variableWeightKg != null ? { quantity: variableWeightKg, line_unit: 'kg' } : {}),
    })
    .eq('id', lineId)
  if (updateError) return { success: false, message: 'La propuesta se guardó, pero no se pudo vincular a la línea.' }

  revalidatePath('/dashboard/albaranes')
  return { success: true, mappingVersionId }
}

export async function listReceiptOrderAllocationOptionsAction(params: {
  ingredientId: string
}): Promise<
  | {
      success: true
      items: Array<{
        purchaseOrderItemId: string
        purchaseOrderId: string
        label: string
        orderUnit: string
        quantityPending: number
      }>
    }
  | { success: false; message: string }
> {
  const gate = await requirePurchaseManager()
  if (!gate.ok) return { success: false, message: gate.message }
  const ingredientId = text(params?.ingredientId)
  if (!ingredientId) return { success: true, items: [] }

  const { data, error } = await gate.supabase
    .from('purchase_order_item_reconciliation')
    .select('purchase_order_item_id,purchase_order_id,ingredient_name,order_unit,quantity_pending')
    .eq('ingredient_id', ingredientId)
    .gt('quantity_pending', 0)
    .order('purchase_order_id')
  if (error) return { success: false, message: 'No se pudieron cargar los pedidos pendientes.' }

  return {
    success: true,
    items: (data ?? []).map((row) => ({
      purchaseOrderItemId: row.purchase_order_item_id,
      purchaseOrderId: row.purchase_order_id,
      label: text(row.ingredient_name) || 'Ingrediente pedido',
      orderUnit: text(row.order_unit),
      quantityPending: Number(row.quantity_pending),
    })),
  }
}

export async function previewReceiptLineAction(params: {
  lineId: string
  mappingVersionId: string
  allocations: ReceiptAllocationInput[]
}): Promise<{ success: true; preview: ReceiptPreview } | { success: false; code?: string; message: string }> {
  const gate = await requirePurchaseManager()
  if (!gate.ok) return { success: false, message: gate.message }

  let proposalId: string | null
  try {
    proposalId = await interpretationProposalIdForLine(gate.supabase, text(params?.lineId))
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'No se pudo comprobar K5.' }
  }

  const { data, error } = await gate.supabase.rpc('apply_receipt_line', {
    p_invoice_line_id: text(params?.lineId),
    p_mapping_version_id: text(params?.mappingVersionId),
    p_allocations: (params?.allocations ?? []) as never,
    p_idempotency_key: `receipt-preview:${crypto.randomUUID()}`,
    p_dry_run: true,
    p_interpretation_proposal_id: proposalId,
  })
  if (error || !data || typeof data !== 'object') {
    return { success: false, message: 'No se pudo validar esta recepción. Revísala antes de confirmar.' }
  }
  const result = data as unknown as ReceiptApplyResult
  if (!result.ok) return { success: false, code: result.code, message: result.message }
  return { success: true, preview: result as unknown as ReceiptPreview }
}

export async function applyReceiptLineAction(params: {
  lineId: string
  mappingVersionId: string
  allocations: ReceiptAllocationInput[]
  idempotencyKey: string
}): Promise<{ success: true; result: ReceiptApplyResult } | { success: false; code?: string; message: string }> {
  const gate = await requirePurchaseManager()
  if (!gate.ok) return { success: false, message: gate.message }

  let proposalId: string | null
  try {
    proposalId = await interpretationProposalIdForLine(gate.supabase, text(params?.lineId))
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'No se pudo comprobar K5.' }
  }

  const { data, error } = await gate.supabase.rpc('apply_receipt_line', {
    p_invoice_line_id: text(params?.lineId),
    p_mapping_version_id: text(params?.mappingVersionId),
    p_allocations: (params?.allocations ?? []) as never,
    p_idempotency_key: text(params?.idempotencyKey),
    p_dry_run: false,
    p_interpretation_proposal_id: proposalId,
  })
  if (error || !data || typeof data !== 'object') {
    return { success: false, message: 'No se pudo confirmar la recepción. No se aplicó ningún cambio.' }
  }
  const result = data as unknown as ReceiptApplyResult
  if (!result.ok) return { success: false, code: result.code, message: result.message }

  revalidatePath('/dashboard/albaranes')
  revalidatePath('/dashboard/inventory')
  revalidatePath('/dashboard/inventory/ledger')
  return { success: true, result }
}
