'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

type GateResult =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; userId: string; role: string | null }
  | { ok: false; message: string }

async function gateAuthenticated(): Promise<GateResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'No autenticado' }

  const { data: profile, error } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (error) return { ok: false, message: error.message }

  return { ok: true, supabase, userId: user.id, role: profile?.role ?? null }
}

export type PurchaseInvoiceListItem = {
  id: string
  created_at: string
  created_by: string | null
  source: string | null
  status: string | null
  supplier_id: number | null
  supplier_name: string | null
  supplier_image_url: string | null
  invoice_number: string | null
  invoice_date: string | null
  total_amount: number | null
  file_path: string | null
}

export async function listPurchaseInvoicesAction(params?: {
  limit?: number
}): Promise<{ success: true; items: PurchaseInvoiceListItem[]; canViewAll: boolean } | { success: false; message: string }> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }

  const limit = Math.min(Math.max(Number(params?.limit ?? 50) || 50, 1), 200)
  const canViewAll = gate.role === 'manager' || gate.role === 'admin'

  let q = gate.supabase
    .from('purchase_invoices')
    .select(
      `
      id,
      created_at,
      created_by,
      source,
      status,
      supplier_id,
      invoice_number,
      invoice_date,
      total_amount,
      file_path,
      suppliers(name,image_url)
    `
    )
    .order('invoice_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!canViewAll) q = q.eq('created_by', gate.userId)

  const { data, error } = await q
  if (error) return { success: false, message: error.message }

  const items: PurchaseInvoiceListItem[] = (data ?? []).map((r: any) => ({
    id: r.id,
    created_at: r.created_at,
    created_by: r.created_by ?? null,
    source: r.source ?? null,
    status: r.status ?? null,
    supplier_id: r.supplier_id ?? null,
    supplier_name: r.suppliers?.name ?? null,
    supplier_image_url: r.suppliers?.image_url ?? null,
    invoice_number: r.invoice_number ?? null,
    invoice_date: r.invoice_date ?? null,
    total_amount: r.total_amount ?? null,
    file_path: r.file_path ?? null,
  }))

  return { success: true, items, canViewAll }
}

export type PurchaseInvoiceLine = {
  id: string
  original_name: string
  quantity: number | null
  unit_price: number | null
  total_price: number | null
  status: string | null
  ingredient_id: string | null
  ingredient_name: string | null
}

export type PurchaseInvoiceDetail = {
  id: string
  created_at: string
  created_by: string | null
  source: string | null
  status: string | null
  supplier_id: number | null
  supplier_name: string | null
  supplier_image_url: string | null
  invoice_number: string | null
  invoice_date: string | null
  total_amount: number | null
  file_path: string | null
  signed_url: string | null
  lines: PurchaseInvoiceLine[]
}

export type SupplierListItem = {
  id: number
  name: string
  image_url: string | null
}

export async function getPurchaseInvoiceDetailAction(
  invoiceId: string
): Promise<{ success: true; detail: PurchaseInvoiceDetail } | { success: false; message: string }> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }

  const id = String(invoiceId ?? '').trim()
  if (!id) return { success: false, message: 'ID inválido' }

  const canViewAll = gate.role === 'manager' || gate.role === 'admin'

  let q = gate.supabase
    .from('purchase_invoices')
    .select(
      `
      id,
      created_at,
      created_by,
      source,
      status,
      supplier_id,
      invoice_number,
      invoice_date,
      total_amount,
      file_path,
      suppliers(name,image_url),
      purchase_invoice_lines(
        id,
        original_name,
        quantity,
        unit_price,
        total_price,
        status,
        mapped_ingredient_id,
        ingredients(name)
      )
    `
    )
    .eq('id', id)

  if (!canViewAll) q = q.eq('created_by', gate.userId)
  const { data, error } = await q.maybeSingle()
  if (error) return { success: false, message: error.message }
  if (!data) return { success: false, message: 'No encontrado o sin permiso' }

  let signedUrl: string | null = null
  const filePath = (data as any).file_path as string | null
  if (filePath) {
    const { data: signed, error: signedErr } = await gate.supabase.storage.from('albaranes').createSignedUrl(filePath, 60 * 10)
    if (signedErr) return { success: false, message: `No se pudo firmar el documento: ${signedErr.message}` }
    signedUrl = signed?.signedUrl ?? null
  }

  const lines = ((data as any).purchase_invoice_lines ?? []).map((l: any) => ({
    id: l.id,
    original_name: l.original_name ?? 'Sin nombre',
    quantity: l.quantity ?? null,
    unit_price: l.unit_price ?? null,
    total_price: l.total_price ?? null,
    status: l.status ?? null,
    ingredient_id: l.mapped_ingredient_id ?? null,
    ingredient_name: l.ingredients?.name ?? null,
  })) as PurchaseInvoiceLine[]

  const detail: PurchaseInvoiceDetail = {
    id: (data as any).id,
    created_at: (data as any).created_at,
    created_by: (data as any).created_by ?? null,
    source: (data as any).source ?? null,
    status: (data as any).status ?? null,
    supplier_id: (data as any).supplier_id ?? null,
    supplier_name: (data as any).suppliers?.name ?? null,
    supplier_image_url: (data as any).suppliers?.image_url ?? null,
    invoice_number: (data as any).invoice_number ?? null,
    invoice_date: (data as any).invoice_date ?? null,
    total_amount: (data as any).total_amount ?? null,
    file_path: filePath,
    signed_url: signedUrl,
    lines,
  }

  return { success: true, detail }
}

export async function searchSuppliersForInvoiceAction(params: {
  query: string
  limit?: number
}): Promise<{ success: true; suppliers: SupplierListItem[] } | { success: false; message: string }> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }

  const q = String(params?.query ?? '').trim()
  if (q.length < 2) return { success: true, suppliers: [] }

  const limit = Math.min(Math.max(Number(params?.limit ?? 40) || 40, 1), 200)

  const { data, error } = await gate.supabase
    .from('suppliers')
    .select('id,name,image_url')
    .ilike('name', `%${q}%`)
    .order('name')
    .limit(limit)

  if (error) return { success: false, message: error.message }

  const suppliers: SupplierListItem[] = (data ?? []).map((r: any) => ({
    id: Number(r.id),
    name: String(r.name ?? ''),
    image_url: r.image_url ?? null,
  }))

  return { success: true, suppliers }
}

export async function setPurchaseInvoiceSupplierAction(params: {
  invoiceId: string
  supplierId: number | null
}): Promise<{ success: true } | { success: false; message: string }> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }

  const isManager = gate.role === 'manager' || gate.role === 'admin'
  if (!isManager) return { success: false, message: 'Sin permiso' }

  const invoiceId = String(params?.invoiceId ?? '').trim()
  if (!invoiceId) return { success: false, message: 'ID de albarán inválido' }

  const supplierId = params?.supplierId == null ? null : Number(params.supplierId)
  if (supplierId != null && (!Number.isFinite(supplierId) || supplierId <= 0)) {
    return { success: false, message: 'ID de proveedor inválido' }
  }

  const { data: updated, error } = await gate.supabase
    .from('purchase_invoices')
    .update({ supplier_id: supplierId })
    .eq('id', invoiceId)
    .select('id')
    .maybeSingle()

  if (error) return { success: false, message: error.message }
  if (!updated) return { success: false, message: 'No se pudo actualizar (RLS o no existe)' }

  return { success: true }
}

export async function updatePurchaseInvoiceLineAction(params: {
  lineId: string
  patch: {
    original_name?: string
    quantity?: number | null
    unit_price?: number | null
    total_price?: number | null
    status?: string | null
    mapped_ingredient_id?: string | null
  }
}): Promise<{ success: true; warning?: string } | { success: false; message: string }> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }

  const isManager = gate.role === 'manager' || gate.role === 'admin'
  if (!isManager) return { success: false, message: 'Sin permiso' }

  const lineId = String(params?.lineId ?? '').trim()
  if (!lineId) return { success: false, message: 'ID de línea inválido' }

  const patch = params?.patch ?? {}
  const update: Record<string, any> = {}

  if (patch.original_name !== undefined) update.original_name = String(patch.original_name ?? '').trim()
  if (patch.quantity !== undefined) update.quantity = patch.quantity
  if (patch.unit_price !== undefined) update.unit_price = patch.unit_price
  if (patch.total_price !== undefined) update.total_price = patch.total_price
  if (patch.status !== undefined) update.status = patch.status
  if (patch.mapped_ingredient_id !== undefined) update.mapped_ingredient_id = patch.mapped_ingredient_id

  if (Object.keys(update).length === 0) return { success: false, message: 'No hay cambios' }
  if (update.original_name !== undefined && !update.original_name) return { success: false, message: 'El nombre no puede estar vacío' }

  // 1) Actualizar la línea (fuente de verdad de la extracción)
  const { data: updated, error: updErr } = await gate.supabase
    .from('purchase_invoice_lines')
    .update(update)
    .eq('id', lineId)
    .select('id, invoice_id, original_name, unit_price, mapped_ingredient_id')
    .maybeSingle()

  if (updErr) return { success: false, message: updErr.message }
  if (!updated) return { success: false, message: 'No se pudo actualizar (RLS o no existe)' }

  // 2) Si la línea está mapeada y tiene unit_price, re-sincronizar precio automáticamente
  const ingredientId = (updated as any).mapped_ingredient_id as string | null
  const unitPrice = (updated as any).unit_price as number | null
  const originalName = (updated as any).original_name as string | null
  const invoiceId = (updated as any).invoice_id as string | null

  if (!ingredientId || unitPrice == null || !Number.isFinite(unitPrice) || unitPrice <= 0 || !invoiceId || !originalName) {
    return { success: true }
  }

  const { data: invoiceRow, error: invErr } = await gate.supabase
    .from('purchase_invoices')
    .select('supplier_id')
    .eq('id', invoiceId)
    .maybeSingle()
  if (invErr) return { success: false, message: invErr.message }

  const supplierId = (invoiceRow as any)?.supplier_id as number | null
  if (supplierId == null) return { success: true, warning: 'La línea está mapeada, pero el albarán no tiene proveedor; no se actualiza precio.' }

  const { data: mapping, error: mapErr } = await gate.supabase
    .from('supplier_item_mappings')
    .select('conversion_factor')
    .eq('supplier_id', supplierId)
    .eq('supplier_item_name', originalName)
    .eq('ingredient_id', ingredientId)
    .maybeSingle()
  if (mapErr) return { success: false, message: mapErr.message }

  const factorRaw = (mapping as any)?.conversion_factor as number | null
  const factor = factorRaw && Number.isFinite(Number(factorRaw)) && Number(factorRaw) !== 0 ? Number(factorRaw) : null
  if (!factor) return { success: true, warning: 'No hay factor de conversión; no se actualiza precio automático.' }

  const newPrice = unitPrice / factor
  if (!Number.isFinite(newPrice) || newPrice <= 0) {
    return { success: true, warning: 'El precio calculado es inválido; no se actualiza ingrediente.' }
  }

  // Leer old_price ANTES de update
  const { data: ing, error: ingErr } = await gate.supabase.from('ingredients').select('current_price').eq('id', ingredientId).maybeSingle()
  if (ingErr) return { success: false, message: ingErr.message }
  const oldPrice = ((ing as any)?.current_price as number | null) ?? 0

  const { error: histErr } = await gate.supabase.from('ingredient_price_history').insert({
    ingredient_id: ingredientId,
    old_price: oldPrice,
    new_price: newPrice,
  })
  if (histErr) return { success: false, message: `Error guardando historial: ${histErr.message}` }

  const { error: ingUpdErr } = await gate.supabase
    .from('ingredients')
    .update({ current_price: newPrice, updated_at: new Date().toISOString() })
    .eq('id', ingredientId)
  if (ingUpdErr) return { success: false, message: `Error actualizando ingrediente: ${ingUpdErr.message}` }

  const { error: mapUpdErr } = await gate.supabase
    .from('supplier_item_mappings')
    .update({ last_known_price: unitPrice })
    .eq('supplier_id', supplierId)
    .eq('supplier_item_name', originalName)
    .eq('ingredient_id', ingredientId)
  if (mapUpdErr) return { success: false, message: `Error actualizando mapeo: ${mapUpdErr.message}` }

  return { success: true }
}

export type StockLineStatus = {
  lineId: string
  stockApplied: boolean
  stockAppliedQty: number | null
  rectifiedCount: number
}

export async function getInvoiceStockStatusesAction(params: {
  lineIds: string[]
}): Promise<{ success: true; statuses: StockLineStatus[] } | { success: false; message: string }> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }

  const isManager = gate.role === 'manager' || gate.role === 'admin'
  if (!isManager) return { success: false, message: 'Sin permiso' }

  const lineIds = Array.from(new Set((params?.lineIds ?? []).map((x) => String(x ?? '').trim()).filter(Boolean)))
  if (lineIds.length === 0) return { success: true, statuses: [] }

  // 1) Movimientos aplicados (referencia exacta ALB-LINE-<id>)
  const appliedRefs = lineIds.map((id) => `ALB-LINE-${id}`)
  const { data: appliedRows, error: appliedErr } = await gate.supabase
    .from('stock_movements')
    .select('reference_doc, quantity')
    .eq('movement_type', 'PURCHASE')
    .in('reference_doc', appliedRefs)
  if (appliedErr) return { success: false, message: appliedErr.message }

  const appliedMap = new Map<string, number>()
  for (const r of appliedRows ?? []) {
    const ref = String((r as any).reference_doc ?? '')
    const qty = Number((r as any).quantity)
    if (!ref) continue
    if (Number.isFinite(qty)) appliedMap.set(ref, qty)
  }

  // 2) Rectificaciones (ALB-LINE-<id>-REVn-...)
  const or = lineIds.map((id) => `reference_doc.ilike.ALB-LINE-${id}-REV%`).join(',')
  let rectRows: any[] = []
  if (or) {
    const { data, error } = await gate.supabase.from('stock_movements').select('reference_doc').or(or).limit(5000)
    if (error) return { success: false, message: error.message }
    rectRows = (data as any[]) ?? []
  }

  const rectCountMap = new Map<string, number>()
  for (const row of rectRows) {
    const ref = String(row.reference_doc ?? '')
    const m = ref.match(/^ALB-LINE-([0-9a-fA-F-]{36})-REV(\d+)-/i)
    if (!m) continue
    const lid = m[1]!
    const n = Number(m[2])
    if (!Number.isFinite(n)) continue
    rectCountMap.set(lid, Math.max(rectCountMap.get(lid) ?? 0, n))
  }

  const statuses: StockLineStatus[] = lineIds.map((lineId) => {
    const appliedRef = `ALB-LINE-${lineId}`
    const qty = appliedMap.get(appliedRef)
    return {
      lineId,
      stockApplied: qty != null,
      stockAppliedQty: qty != null ? qty : null,
      rectifiedCount: rectCountMap.get(lineId) ?? 0,
    }
  })

  return { success: true, statuses }
}

export type IngredientCandidate = {
  id: string
  name: string
  score: number
  current_price: number
  purchase_unit: string
}

export async function suggestIngredientsForLineAction(params: {
  extractedName: string
}): Promise<
  | { success: true; suggestedIngredientId: string | null; candidates: IngredientCandidate[] }
  | { success: false; message: string }
> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }

  const isManager = gate.role === 'manager' || gate.role === 'admin'
  if (!isManager) return { success: false, message: 'Sin permiso' }

  const extractedName = String(params?.extractedName ?? '').trim()
  if (!extractedName) return { success: true, suggestedIngredientId: null, candidates: [] }

  // Lazy import to keep this file lightweight.
  const { matchIngredientCandidates, pickSuggestedCandidate } = await import('@/lib/albaran-price-match')

  const { data: ingRows, error } = await gate.supabase
    .from('ingredients')
    .select('id, name, current_price, purchase_unit')
    .order('name')
    .limit(4000)
  if (error) return { success: false, message: error.message }

  const ingredients = (ingRows ?? []).map((r: any) => ({
    id: r.id,
    name: String(r.name ?? ''),
    current_price: Number(r.current_price) || 0,
    purchase_unit: r.purchase_unit ?? 'kg',
  }))

  const cands = matchIngredientCandidates(extractedName, ingredients, 8)
  const suggested = pickSuggestedCandidate(cands)

  const enriched: IngredientCandidate[] = cands.map((c: any) => {
    const row = ingredients.find((i: any) => i.id === c.id)
    return {
      id: c.id,
      name: c.name,
      score: c.score,
      current_price: row?.current_price ?? 0,
      purchase_unit: row?.purchase_unit ?? 'kg',
    }
  })

  return { success: true, suggestedIngredientId: suggested, candidates: enriched }
}

export async function searchIngredientsForMappingAction(params: {
  query: string
  limit?: number
}): Promise<{ success: true; items: { id: string; name: string; purchase_unit: string; current_price: number }[] } | { success: false; message: string }> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }

  const isManager = gate.role === 'manager' || gate.role === 'admin'
  if (!isManager) return { success: false, message: 'Sin permiso' }

  const q = String(params?.query ?? '').trim()
  if (q.length < 2) return { success: true, items: [] }
  const limit = Math.min(Math.max(Number(params?.limit ?? 30) || 30, 1), 200)

  const { data, error } = await gate.supabase
    .from('ingredients')
    .select('id,name,purchase_unit,current_price')
    .ilike('name', `%${q}%`)
    .order('name')
    .limit(limit)
  if (error) return { success: false, message: error.message }

  const items = (data ?? []).map((r: any) => ({
    id: String(r.id),
    name: String(r.name ?? ''),
    purchase_unit: r.purchase_unit ?? 'kg',
    current_price: Number(r.current_price) || 0,
  }))

  return { success: true, items }
}

export async function confirmInvoiceLineMappingAction(params: {
  lineId: string
  invoiceId: string
  ingredientId: string
  conversionFactor: number
}): Promise<{ success: true } | { success: false; message: string }> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }

  const isManager = gate.role === 'manager' || gate.role === 'admin'
  if (!isManager) return { success: false, message: 'Sin permiso' }

  const lineId = String(params?.lineId ?? '').trim()
  const invoiceId = String(params?.invoiceId ?? '').trim()
  const ingredientId = String(params?.ingredientId ?? '').trim()
  const factor = Number(params?.conversionFactor)

  if (!lineId || !invoiceId || !ingredientId) return { success: false, message: 'Datos incompletos' }
  if (!Number.isFinite(factor) || factor <= 0) return { success: false, message: 'Factor inválido' }

  // Proveedor obligatorio (regla 2A): sin supplier_id no se permite confirmar.
  const { data: inv, error: invErr } = await gate.supabase.from('purchase_invoices').select('supplier_id').eq('id', invoiceId).maybeSingle()
  if (invErr) return { success: false, message: invErr.message }
  const supplierId = (inv as any)?.supplier_id as number | null
  if (supplierId == null) return { success: false, message: 'Este albarán no tiene proveedor asignado.' }

  // Leer nombre original y precio/cantidad para aprendizaje y precio.
  const { data: line, error: lineErr } = await gate.supabase
    .from('purchase_invoice_lines')
    .select('original_name, unit_price')
    .eq('id', lineId)
    .maybeSingle()
  if (lineErr) return { success: false, message: lineErr.message }
  const originalName = String((line as any)?.original_name ?? '').trim()
  if (!originalName) return { success: false, message: 'La línea no tiene nombre' }

  // 1) Aprendizaje: diccionario proveedor+texto -> ingrediente+factor
  const { error: mapErr } = await gate.supabase
    .from('supplier_item_mappings')
    .upsert(
      {
        supplier_id: supplierId,
        supplier_item_name: originalName,
        ingredient_id: ingredientId,
        conversion_factor: factor,
        last_known_price: (line as any)?.unit_price ?? null,
      },
      { onConflict: 'supplier_id,supplier_item_name' }
    )
  if (mapErr) return { success: false, message: `Error guardando aprendizaje: ${mapErr.message}` }

  // 2) Marcar línea como mapeada (esto dispara auto-stock en BD)
  const { error: updErr } = await gate.supabase
    .from('purchase_invoice_lines')
    .update({ mapped_ingredient_id: ingredientId, status: 'mapped' })
    .eq('id', lineId)
  if (updErr) return { success: false, message: updErr.message }

  // 3) Revalidaciones para refrescar UI
  try {
    revalidatePath('/dashboard/albaranes')
  } catch {}

  return { success: true }
}

export async function rectifyInvoiceLineStockAction(params: {
  lineId: string
  ingredientId: string
  newQtyApplied: number
}): Promise<{ success: true } | { success: false; message: string }> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }

  const isManager = gate.role === 'manager' || gate.role === 'admin'
  if (!isManager) return { success: false, message: 'Sin permiso' }

  const lineId = String(params?.lineId ?? '').trim()
  const ingredientId = String(params?.ingredientId ?? '').trim()
  const newQty = Number(params?.newQtyApplied)
  if (!lineId || !ingredientId) return { success: false, message: 'Datos incompletos' }
  if (!Number.isFinite(newQty) || newQty <= 0) return { success: false, message: 'Cantidad nueva inválida' }

  // 1) Leer cantidad aplicada original (si no existe, no rectificar aquí)
  const baseRef = `ALB-LINE-${lineId}`
  const { data: applied, error: appErr } = await gate.supabase
    .from('stock_movements')
    .select('quantity, unit')
    .eq('movement_type', 'PURCHASE')
    .eq('ingredient_id', ingredientId)
    .eq('reference_doc', baseRef)
    .maybeSingle()
  if (appErr) return { success: false, message: appErr.message }
  const oldQty = Number((applied as any)?.quantity)
  const unit = String((applied as any)?.unit ?? 'ud')
  if (!Number.isFinite(oldQty) || oldQty <= 0) return { success: false, message: 'No hay stock aplicado previo para rectificar.' }

  // 2) Calcular REVn siguiente
  const { data: revRows, error: revErr } = await gate.supabase
    .from('stock_movements')
    .select('reference_doc')
    .or(`reference_doc.ilike.${baseRef}-REV%`)
    .limit(5000)
  if (revErr) return { success: false, message: revErr.message }

  let maxRev = 0
  for (const r of (revRows as any[]) ?? []) {
    const ref = String(r.reference_doc ?? '')
    const m = ref.match(/-REV(\d+)-/i)
    if (!m) continue
    const n = Number(m[1])
    if (Number.isFinite(n)) maxRev = Math.max(maxRev, n)
  }
  const next = maxRev + 1

  const undoRef = `${baseRef}-REV${next}-UNDO`
  const applyRef = `${baseRef}-REV${next}-APPLY`

  // 3) Insertar 2 movimientos (ADJUSTMENT): -old y +new
  const payload = [
    {
      movement_type: 'ADJUSTMENT',
      ingredient_id: ingredientId,
      quantity: -oldQty,
      unit,
      movement_date: new Date().toISOString(),
      reference_doc: undoRef,
      original_description: `Rectificación albarán: deshacer ${baseRef}`,
      processed_by: 'Albaranes-Rectificar',
      notes: `Antes: ${oldQty} → Ahora: ${newQty}`,
    },
    {
      movement_type: 'ADJUSTMENT',
      ingredient_id: ingredientId,
      quantity: newQty,
      unit,
      movement_date: new Date().toISOString(),
      reference_doc: applyRef,
      original_description: `Rectificación albarán: aplicar ${baseRef}`,
      processed_by: 'Albaranes-Rectificar',
      notes: `Antes: ${oldQty} → Ahora: ${newQty}`,
    },
  ]

  const { error: insErr } = await gate.supabase.from('stock_movements').insert(payload)
  if (insErr) return { success: false, message: insErr.message }

  try {
    revalidatePath('/dashboard/albaranes')
  } catch {}

  return { success: true }
}

