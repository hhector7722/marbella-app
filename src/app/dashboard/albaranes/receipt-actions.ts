'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

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
  if (!gate.ok || !gate.supabase) return { success: false, message: gate.message }

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
    .select('id, invoice_id, original_name, unit_price')
    .eq('id', lineId)
    .maybeSingle()
  if (lineError || !line || line.invoice_id !== invoiceId || !text(line.original_name)) {
    return { success: false, message: 'No se encontró la línea revisable de este albarán.' }
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
        conversion_factor: conversionFactor,
        line_billing_unit: lineBillingUnit,
        line_content_qty: lineContentQty,
        line_content_unit: lineContentUnit,
        last_known_price: line.unit_price,
      },
      { onConflict: 'supplier_id,supplier_item_name' }
    )
    .select('id')
    .maybeSingle()
  if (legacyError) return { success: false, message: 'No se pudo guardar la propuesta de producto del proveedor.' }

  const { data: latest, error: latestError } = await gate.supabase
    .from('purchase_mapping_versions')
    .select('id, ingredient_id, conversion_factor, line_billing_unit, line_content_qty, line_content_unit')
    .eq('supplier_id', supplierId)
    .ilike('supplier_item_name', line.original_name)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestError) return { success: false, message: 'No se pudo leer la versión actual de mapeo.' }

  const unchanged =
    latest &&
    latest.ingredient_id === ingredientId &&
    Number(latest.conversion_factor) === conversionFactor &&
    text(latest.line_billing_unit).toLowerCase() === lineBillingUnit.toLowerCase() &&
    Number(latest.line_content_qty) === lineContentQty &&
    text(latest.line_content_unit).toLowerCase() === lineContentUnit.toLowerCase()

  let mappingVersionId = latest?.id ?? null
  if (!unchanged) {
    const { data: inserted, error: insertError } = await gate.supabase
      .from('purchase_mapping_versions')
      .insert({
        legacy_mapping_id: legacyMapping?.id ?? null,
        supplier_id: supplierId,
        supplier_item_name: line.original_name,
        ingredient_id: ingredientId,
        conversion_factor: conversionFactor,
        line_billing_unit: lineBillingUnit,
        line_content_qty: lineContentQty,
        line_content_unit: lineContentUnit,
        status: 'proposed',
        supersedes_id: latest?.id ?? null,
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

  const { error: updateError } = await gate.supabase
    .from('purchase_invoice_lines')
    .update({ mapped_ingredient_id: ingredientId, status: 'mapped' })
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
  if (!gate.ok || !gate.supabase) return { success: false, message: gate.message }
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
  if (!gate.ok || !gate.supabase) return { success: false, message: gate.message }
  const { data, error } = await gate.supabase.rpc('apply_receipt_line', {
    p_invoice_line_id: text(params?.lineId),
    p_mapping_version_id: text(params?.mappingVersionId),
    p_allocations: (params?.allocations ?? []) as never,
    p_idempotency_key: `receipt-preview:${crypto.randomUUID()}`,
    p_dry_run: true,
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
  if (!gate.ok || !gate.supabase) return { success: false, message: gate.message }
  const { data, error } = await gate.supabase.rpc('apply_receipt_line', {
    p_invoice_line_id: text(params?.lineId),
    p_mapping_version_id: text(params?.mappingVersionId),
    p_allocations: (params?.allocations ?? []) as never,
    p_idempotency_key: text(params?.idempotencyKey),
    p_dry_run: false,
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
