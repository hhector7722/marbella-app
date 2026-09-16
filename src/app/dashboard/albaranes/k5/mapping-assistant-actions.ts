'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { proposalInputFingerprint } from '@/lib/albaranes/k5/normalizer'
import {
  buildMappingAssistantSuggestions,
  type MappingAssistantIngredient,
  type MappingAssistantLegacy,
  type MappingAssistantSuggestion,
  type MappingAssistantUnresolved,
} from '@/lib/albaranes/k5/mapping-assistant'
import { saveReceiptMappingProposalAction } from '../receipt-actions'
import { listK5BatchReviewAction } from './batch-actions'

export type K5MappingAssistantSuggestion = MappingAssistantSuggestion & {
  fingerprint: string
}

export type K5MappingAssistantState = {
  suggestions: K5MappingAssistantSuggestion[]
  unresolved: MappingAssistantUnresolved[]
}

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function suggestionFingerprint(suggestion: MappingAssistantSuggestion): string {
  return proposalInputFingerprint({
    schema: 'k5-mapping-assistant-v1',
    proposal_id: suggestion.proposalId,
    line_id: suggestion.lineId,
    source_item_name: suggestion.sourceItemName,
    ingredient_id: suggestion.ingredientId,
    conversion_factor: suggestion.conversionFactor,
    line_billing_unit: suggestion.lineBillingUnit,
    line_content_qty: suggestion.lineContentQty,
    line_content_unit: suggestion.lineContentUnit,
    purchase_unit: suggestion.purchaseUnit,
    base_unit: suggestion.baseUnit,
    source: suggestion.source,
  })
}

async function prepareAssistant(invoiceId: string): Promise<K5MappingAssistantState> {
  const batch = await listK5BatchReviewAction({ invoiceId })
  if (!batch.success) throw new Error(batch.message)

  const rows = batch.rows
    .filter((row) =>
      Boolean(row.lineId)
      && !row.confirmed
      && !row.ingredientId
      && (row.disposition === 'needs_mapping' || row.disposition === 'needs_review')
      && (row.disposition === 'needs_mapping' || row.reviewReasons.includes('mapping_missing'))
    )
    .map((row) => ({
      proposalId: row.proposalId,
      lineId: row.lineId!,
      sourceItemName: row.sourceItemName,
      lineUnit: row.lineUnit,
      reviewReasons: row.reviewReasons,
    }))

  if (rows.length === 0) return { suggestions: [], unresolved: [] }

  const supabase = await createClient()
  const { data: invoice, error: invoiceError } = await supabase
    .from('purchase_invoices')
    .select('supplier_id')
    .eq('id', invoiceId)
    .maybeSingle()
  const supplierId = Number(invoice?.supplier_id)
  if (invoiceError || !Number.isFinite(supplierId)) throw new Error('El albarán no tiene un proveedor válido.')

  const [{ data: ingredientRows, error: ingredientError }, { data: legacyRows, error: legacyError }] = await Promise.all([
    supabase
      .from('ingredients')
      .select('id,name,current_price,purchase_unit,base_unit'),
    supabase
      .from('supplier_item_mappings')
      .select('supplier_item_name,ingredient_id,conversion_factor,line_billing_unit,line_content_qty,line_content_unit')
      .eq('supplier_id', supplierId),
  ])
  if (ingredientError) throw new Error('No se pudo leer el catálogo de ingredientes.')
  if (legacyError) throw new Error('No se pudo leer el diccionario histórico del proveedor.')

  const ingredients: MappingAssistantIngredient[] = (ingredientRows ?? [])
    .filter((row) => text(row.id) && text(row.name) && text(row.purchase_unit) && text(row.base_unit))
    .map((row) => ({
      id: text(row.id),
      name: text(row.name),
      current_price: Number(row.current_price) || 0,
      purchase_unit: text(row.purchase_unit),
      base_unit: text(row.base_unit),
    }))

  const legacyMappings: MappingAssistantLegacy[] = (legacyRows ?? [])
    .filter((row) => text(row.supplier_item_name) && text(row.ingredient_id))
    .map((row) => ({
      supplier_item_name: text(row.supplier_item_name),
      ingredient_id: text(row.ingredient_id),
      conversion_factor: row.conversion_factor == null ? null : Number(row.conversion_factor),
      line_billing_unit: text(row.line_billing_unit) || null,
      line_content_qty: row.line_content_qty == null ? null : Number(row.line_content_qty),
      line_content_unit: text(row.line_content_unit) || null,
    }))

  const result = buildMappingAssistantSuggestions({ supplierId, rows, ingredients, legacyMappings })
  return {
    suggestions: result.suggestions.map((suggestion) => ({
      ...suggestion,
      fingerprint: suggestionFingerprint(suggestion),
    })),
    unresolved: result.unresolved,
  }
}

export async function listK5MappingAssistantAction(params: { invoiceId: string }): Promise<
  | { success: true; state: K5MappingAssistantState }
  | { success: false; message: string }
> {
  const invoiceId = text(params?.invoiceId)
  if (!invoiceId) return { success: false, message: 'Albarán inválido.' }
  try {
    return { success: true, state: await prepareAssistant(invoiceId) }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'No se pudo preparar el asistente de mappings.' }
  }
}

export async function applyK5MappingAssistantAction(params: {
  invoiceId: string
  fingerprints: string[]
}): Promise<
  | { success: true; applied: number }
  | { success: false; message: string; applied: number }
> {
  const invoiceId = text(params?.invoiceId)
  const fingerprints = [...new Set((params?.fingerprints ?? []).map(text).filter(Boolean))]
  if (!invoiceId || fingerprints.length === 0) {
    return { success: false, message: 'Selecciona al menos un mapping sugerido.', applied: 0 }
  }
  if (fingerprints.length > 80) return { success: false, message: 'El lote de mappings es demasiado grande.', applied: 0 }

  let state: K5MappingAssistantState
  try {
    state = await prepareAssistant(invoiceId)
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'No se pudo revalidar el asistente.', applied: 0 }
  }

  const byFingerprint = new Map(state.suggestions.map((suggestion) => [suggestion.fingerprint, suggestion]))
  const selected = fingerprints.map((fingerprint) => byFingerprint.get(fingerprint)).filter((item): item is K5MappingAssistantSuggestion => Boolean(item))
  if (selected.length !== fingerprints.length) {
    return { success: false, message: 'Alguna sugerencia cambió desde que abriste la pantalla. Actualiza antes de guardar.', applied: 0 }
  }

  let applied = 0
  for (const suggestion of selected) {
    const result = await saveReceiptMappingProposalAction({
      invoiceId,
      lineId: suggestion.lineId,
      ingredientId: suggestion.ingredientId,
      conversionFactor: suggestion.conversionFactor,
      lineBillingUnit: suggestion.lineBillingUnit,
      lineContentQty: suggestion.lineContentQty,
      lineContentUnit: suggestion.lineContentUnit,
    })
    if (!result.success) {
      revalidatePath('/dashboard/albaranes')
      revalidatePath('/dashboard/albaranes/k5')
      return {
        success: false,
        message: applied > 0
          ? `${suggestion.sourceItemName}: ${result.message} ${applied} mapping(s) anteriores sí quedaron guardados; no hubo efectos económicos.`
          : `${suggestion.sourceItemName}: ${result.message}`,
        applied,
      }
    }
    applied += 1
  }

  revalidatePath('/dashboard/albaranes')
  revalidatePath('/dashboard/albaranes/k5')
  return { success: true, applied }
}
