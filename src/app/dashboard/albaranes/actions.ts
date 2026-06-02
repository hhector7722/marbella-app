'use server'

// SSOT precios ingredientes / albaranes: context/INGREDIENTS_PRECIOS_Y_ALBARANES.md
import { suggestedAlbaranConversionFactorFromIngredient } from '@/lib/ingredient-pack-pricing'
import {
  INVOICE_LINE_STATUS_EXCLUDED,
  INVOICE_LINE_STATUS_EXPENSE_ONLY,
  invoiceLineRequiresStock,
  isInvoiceLineResolved,
} from '@/lib/albaranes-line-status'
import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { formatYmdInMadrid } from '@/lib/madrid-date-bounds'

type GateResult =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; userId: string; role: string | null }
  | { ok: false; message: string }

async function gateAuthenticated(): Promise<GateResult> {
  const supabase = await createClient()
  // `getSession()` lee el JWT de las cookies sin round-trip a GoTrue.
  // Evita cuelgues en Server Actions idénticos a los del middleware con
  // `getUser()`. RLS en PostgREST sigue aplicando políticas con ese JWT.
  const {
    data: { session },
    error: sessionErr,
  } = await supabase.auth.getSession()
  if (sessionErr) return { ok: false, message: sessionErr.message }
  const user = session?.user
  if (!user) return { ok: false, message: 'No autenticado' }

  const { data: profile, error } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (error) return { ok: false, message: error.message }

  return { ok: true, supabase, userId: user.id, role: profile?.role ?? null }
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Entornos sin migración aplicada: PostgREST falla en filtros/DELETE por `reference_doc`.
 * La RPC `SECURITY DEFINER` ejecuta ADD COLUMN si falta. Idempotente.
 */
async function ensureStockMovementsReferenceDocColumn(
  supabase: SupabaseServerClient
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.rpc('ensure_stock_movements_reference_doc_column')
  if (error) {
    const m = String(error.message ?? '')
    if (/could not find the function|PGRST202|function .* does not exist|schema cache/i.test(m)) {
      return {
        ok: false,
        message:
          'Falta la reparación de esquema en la base de datos. En Supabase → SQL Editor ejecuta supabase/migrations/20260516130000_ensure_stock_movements_reference_doc_rpc.sql o `supabase db push`.',
      }
    }
    return { ok: false, message: m }
  }
  return { ok: true }
}

/** Alinea cabecera con líneas+stock (migración 20260531100000). Ignora si RPC aún no existe. */
async function syncPurchaseInvoiceStatusRpc(
  supabase: SupabaseServerClient,
  invoiceId: string
): Promise<void> {
  const id = String(invoiceId ?? '').trim()
  if (!id) return
  const { error } = await supabase.rpc('sync_purchase_invoice_status', { p_invoice_id: id })
  if (error) {
    const m = String(error.message ?? '')
    if (/could not find the function|PGRST202|function .* does not exist|schema cache/i.test(m)) return
    console.error('sync_purchase_invoice_status:', m)
  }
}

function isMissingReferenceDocColumnError(message: string | undefined): boolean {
  const m = String(message ?? '')
  return m.includes('reference_doc') && m.includes('does not exist')
}

/** Si el diccionario tiene factor 1 por defecto pero el ingrediente es botella→L, usa 0,75 L/botella. */
async function effectiveConversionFactorForIngredient(
  supabase: SupabaseServerClient,
  ingredientId: string,
  storedFactor: number | null | undefined
): Promise<number> {
  let factor =
    storedFactor != null && Number.isFinite(Number(storedFactor)) && Number(storedFactor) > 0
      ? Number(storedFactor)
      : 1
  const { data: ing } = await supabase
    .from('ingredients')
    .select('supplier_pricing_mode, purchase_unit, pack_units, pack_unit_size_qty, pack_unit_size_unit')
    .eq('id', ingredientId)
    .maybeSingle()
  if (!ing) return factor
  const implied = suggestedAlbaranConversionFactorFromIngredient(ing as any)
  if (implied != null && implied > 0 && Math.abs(factor - 1) < 1e-9) factor = implied
  return factor
}

/**
 * Tras cambiar factor o precio unitario en una línea mapeada, recalcula
 * `ingredients.current_price` vía RPC dimensional (salvo `price_locked`).
 */
async function resyncIngredientPriceForMappedLine(
  supabase: SupabaseServerClient,
  ctx: { supplierId: number; originalName: string; ingredientId: string; unitPrice: number | null }
): Promise<{ ok: true; warning?: string } | { ok: false; message: string }> {
  const { supplierId, originalName, ingredientId, unitPrice } = ctx
  if (!ingredientId || !originalName) return { ok: true }
  if (unitPrice == null || !Number.isFinite(unitPrice) || unitPrice <= 0) return { ok: true }

  const { data: mapping, error: mapErr } = await supabase
    .from('supplier_item_mappings')
    .select('conversion_factor, line_content_qty, line_content_unit')
    .eq('supplier_id', supplierId)
    .eq('supplier_item_name', originalName)
    .eq('ingredient_id', ingredientId)
    .maybeSingle()
  if (mapErr) return { ok: false, message: mapErr.message }

  const { data: ing, error: ingErr } = await supabase
    .from('ingredients')
    .select('current_price, price_locked, purchase_unit')
    .eq('id', ingredientId)
    .maybeSingle()
  if (ingErr) return { ok: false, message: ingErr.message }

  if ((ing as any)?.price_locked === true) {
    await supabase
      .from('supplier_item_mappings')
      .update({ last_known_price: unitPrice })
      .eq('supplier_id', supplierId)
      .eq('supplier_item_name', originalName)
      .eq('ingredient_id', ingredientId)
    return { ok: true, warning: 'Precio fijo: no se ha cambiado el precio del catálogo.' }
  }

  const factorRaw = (mapping as any)?.conversion_factor as number | null
  const fallbackFactor = await effectiveConversionFactorForIngredient(supabase, ingredientId, factorRaw)

  const { data: newPrice, error: rpcErr } = await supabase.rpc('invoice_line_price_to_purchase_unit', {
    p_unit_price: unitPrice,
    p_mapping_content_qty: (mapping as any)?.line_content_qty || null,
    p_mapping_content_unit: (mapping as any)?.line_content_unit || null,
    p_ingredient_purchase_unit: (ing as any)?.purchase_unit,
    p_fallback_factor: fallbackFactor,
  })

  if (rpcErr || newPrice == null) {
    return { ok: false, message: 'Descuadre dimensional: Imposible calcular el nuevo precio unitario.' }
  }

  const oldPrice = ((ing as any)?.current_price as number | null) ?? 0
  const { error: histErr } = await supabase.from('ingredient_price_history').insert({
    ingredient_id: ingredientId,
    old_price: oldPrice,
    new_price: newPrice,
  })
  if (histErr) return { ok: false, message: `Error guardando historial: ${histErr.message}` }

  const { error: ingUpdErr } = await supabase
    .from('ingredients')
    .update({ current_price: newPrice, updated_at: new Date().toISOString() })
    .eq('id', ingredientId)
  if (ingUpdErr) return { ok: false, message: `Error actualizando ingrediente: ${ingUpdErr.message}` }

  await supabase
    .from('supplier_item_mappings')
    .update({ last_known_price: unitPrice })
    .eq('supplier_id', supplierId)
    .eq('supplier_item_name', originalName)
    .eq('ingredient_id', ingredientId)

  return { ok: true }
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
  is_fully_processed: boolean
}

export async function listPurchaseInvoicesAction(params?: {
  limit?: number
}): Promise<{ success: true; items: PurchaseInvoiceListItem[]; canViewAll: boolean } | { success: false; message: string }> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }

  const limit = Math.min(Math.max(Number(params?.limit ?? 50) || 50, 1), 200)
  // Lectura del histórico abierta a TODO authenticated (staff, supervisor,
  // manager, admin). Está alineado con la RLS real de Supabase (SELECT con
  // qual=true). Las acciones de modificación (UPDATE/DELETE/mapeo/reparar
  // stock/cambio de proveedor) siguen restringidas a manager/admin más
  // abajo. `canViewAll` se mantiene en el payload por compatibilidad
  // (algunos consumidores aún lo leen) pero ya no filtra la query.
  const canViewAll = gate.role === 'manager' || gate.role === 'admin' || gate.role === 'supervisor'

  const q = gate.supabase
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

  const { data, error } = await q
  if (error) return { success: false, message: error.message }

  const baseItems = (data ?? []).map((r: any) => ({
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
  })) as Omit<PurchaseInvoiceListItem, 'is_fully_processed'>[]

  const items = await enrichInvoicesWithProcessingState(gate.supabase, baseItems)

  return { success: true, items, canViewAll }
}

function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  const t = String(ymd ?? '').trim()
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null
  return { y, m: mo, d }
}

function formatYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(ymd: string, days: number): string {
  const p = parseYmd(ymd)
  if (!p) return ymd
  const dt = new Date(p.y, p.m - 1, p.d)
  dt.setDate(dt.getDate() + days)
  return formatYmd(dt)
}

async function listPurchaseInvoicesByRange(gate: Extract<GateResult, { ok: true }>, startYmd: string, endYmd: string, limit = 200) {
  // Lectura abierta a TODO authenticated (alineado con RLS de Supabase).
  // Ver nota en `listPurchaseInvoicesAction`. `canViewAll` se mantiene
  // por compatibilidad del payload.
  const canViewAll = gate.role === 'manager' || gate.role === 'admin' || gate.role === 'supervisor'
  const q = gate.supabase
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
    .gte('invoice_date', startYmd)
    .lte('invoice_date', endYmd)
    .order('invoice_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  const { data, error } = await q
  if (error) throw error
  const baseItems = (data ?? []).map((r: any) => ({
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
  })) as Omit<PurchaseInvoiceListItem, 'is_fully_processed'>[]

  const items = await enrichInvoicesWithProcessingState(gate.supabase, baseItems)
  return { items, canViewAll }
}

async function enrichInvoicesWithProcessingState(
  supabase: Extract<GateResult, { ok: true }>['supabase'],
  baseItems: Omit<PurchaseInvoiceListItem, 'is_fully_processed'>[]
): Promise<PurchaseInvoiceListItem[]> {
  const invoiceIds = baseItems.map((x) => x.id)
  if (invoiceIds.length === 0) return baseItems.map((b) => ({ ...b, is_fully_processed: false }))

  // 1) Leer líneas por invoice (mínimo para decidir “todo matcheado”)
  const { data: lines, error: linesErr } = await supabase
    .from('purchase_invoice_lines')
    .select('id, invoice_id, mapped_ingredient_id, status')
    .in('invoice_id', invoiceIds)
    .limit(5000)
  if (linesErr) {
    return baseItems.map((b) => ({ ...b, is_fully_processed: false }))
  }

  const byInv = new Map<string, Array<{ id: string; resolved: boolean; needsStock: boolean }>>()
  for (const r of (lines as any[]) ?? []) {
    const invId = String(r.invoice_id ?? '')
    const id = String(r.id ?? '')
    const resolved = isInvoiceLineResolved(r)
    const needsStock = invoiceLineRequiresStock(r)
    if (!invId || !id) continue
    const arr = byInv.get(invId) ?? []
    arr.push({ id, resolved, needsStock })
    byInv.set(invId, arr)
  }

  // 2) Stock aplicado: existe movimiento PURCHASE con ref ALB-LINE-<lineId>
  const allLineIds = Array.from(new Set(((lines as any[]) ?? []).map((r) => String(r.id ?? '')).filter(Boolean)))
  const refs = allLineIds.map((id) => `ALB-LINE-${id}`)
  let appliedSet = new Set<string>()
  if (refs.length) {
    const fetchApplied = () =>
      supabase
        .from('stock_movements')
        .select('reference_doc')
        .eq('movement_type', 'PURCHASE')
        .in('reference_doc', refs)
        .limit(5000)
    let { data: moves, error: mvErr } = await fetchApplied()
    if (mvErr && isMissingReferenceDocColumnError(mvErr.message)) {
      const fix = await ensureStockMovementsReferenceDocColumn(supabase)
      if (fix.ok) {
        ;({ data: moves, error: mvErr } = await fetchApplied())
      }
    }
    if (!mvErr) {
      appliedSet = new Set(((moves as any[]) ?? []).map((m) => String(m.reference_doc ?? '')).filter(Boolean))
    }
  }

  return baseItems.map((b) => {
    const arr = byInv.get(b.id) ?? []
    if (arr.length === 0) return { ...b, is_fully_processed: false }
    const allResolved = arr.every((x) => x.resolved)
    const allStockOk = arr.every((x) => !x.needsStock || appliedSet.has(`ALB-LINE-${x.id}`))
    return { ...b, is_fully_processed: allResolved && allStockOk }
  })
}

/** Listado inicial del histórico: últimos 45 días (Madrid), no solo la semana calendario. */
export async function listPurchaseInvoicesDefaultWeekAction(): Promise<
  | { success: true; items: PurchaseInvoiceListItem[]; canViewAll: boolean; weekStart: string; weekEnd: string }
  | { success: false; message: string }
> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }

  const todayYmd = formatYmdInMadrid(new Date())
  const rangeEnd = todayYmd
  const rangeStart = addDays(todayYmd, -44)

  try {
    const cur = await listPurchaseInvoicesByRange(gate, rangeStart, rangeEnd, 200)
    return { success: true, items: cur.items, canViewAll: cur.canViewAll, weekStart: rangeStart, weekEnd: rangeEnd }
  } catch (e: any) {
    return { success: false, message: e?.message ?? 'Error listando albaranes' }
  }
}

export async function listSuppliersForFilterAction(): Promise<{ success: true; suppliers: { id: number; name: string }[] } | { success: false; message: string }> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }

  const { data, error } = await gate.supabase.from('suppliers').select('id,name').order('name').limit(2000)
  if (error) return { success: false, message: error.message }
  const suppliers = (data ?? []).map((r: any) => ({ id: Number(r.id), name: String(r.name ?? '') })).filter((s) => s.id > 0 && s.name)
  return { success: true, suppliers }
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
  /** Unidad literal extraída del albarán (escáner). */
  line_unit: string | null
  /** Factor en `supplier_item_mappings` para esta línea mapeada (mismo proveedor + nombre + ingrediente). */
  conversion_factor: number | null
  line_billing_unit: string | null
  line_content_qty: number | null
  line_content_unit: string | null
}

export type PurchaseInvoiceExtraSheet = {
  page_order: number
  signed_url: string
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
  /** Hojas 2+ firmadas (Storage); la hoja 1 es `signed_url` de `file_path`. */
  extra_document_sheets: PurchaseInvoiceExtraSheet[]
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

  // Detalle abierto a TODO authenticated (alineado con RLS). La UI ya
  // oculta los controles de manager (mapeo, reparar, eliminar, etc.)
  // cuando el rol no es elevado, así que staff y supervisor verán el
  // albarán en modo solo-lectura.
  const q = gate.supabase
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
        line_unit,
        ingredients(name)
      )
    `
    )
    .eq('id', id)

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

  const extra_document_sheets: PurchaseInvoiceExtraSheet[] = []
  const { data: attRows, error: attErr } = await gate.supabase
    .from('purchase_invoice_attachments')
    .select('file_path, page_order')
    .eq('invoice_id', id)
    .order('page_order', { ascending: true })

  if (attErr) {
    console.error('purchase_invoice_attachments select:', attErr.message)
  } else {
    for (const row of attRows ?? []) {
      const fp = String((row as any).file_path ?? '').trim()
      const po = Number((row as any).page_order)
      if (!fp) continue
      const { data: signedAtt, error: attSignedErr } = await gate.supabase.storage
        .from('albaranes')
        .createSignedUrl(fp, 60 * 10)
      if (attSignedErr || !signedAtt?.signedUrl) continue
      extra_document_sheets.push({
        page_order: Number.isFinite(po) ? po : extra_document_sheets.length + 2,
        signed_url: signedAtt.signedUrl,
      })
    }
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
    line_unit: l.line_unit ?? null,
    conversion_factor: null as number | null,
    line_billing_unit: null as string | null,
    line_content_qty: null as number | null,
    line_content_unit: null as string | null,
  })) as PurchaseInvoiceLine[]

  const supplierIdForMaps = (data as any).supplier_id as number | null
  if (supplierIdForMaps != null && lines.length > 0) {
    const mappedPairs = lines
      .filter((ln) => ln.ingredient_id)
      .map((ln) => ({ name: String(ln.original_name ?? '').trim(), ing: ln.ingredient_id as string }))
      .filter((p) => p.name && p.ing)
    const uniqueNames = [...new Set(mappedPairs.map((p) => p.name))]
    if (uniqueNames.length > 0) {
      const { data: mapRows, error: mapErr } = await gate.supabase
        .from('supplier_item_mappings')
        .select(
          'supplier_item_name, ingredient_id, conversion_factor, line_billing_unit, line_content_qty, line_content_unit'
        )
        .eq('supplier_id', supplierIdForMaps)
        .in('supplier_item_name', uniqueNames)
      if (mapErr) return { success: false, message: mapErr.message }
      type MapRow = {
        conversion_factor: number
        line_billing_unit: string | null
        line_content_qty: number | null
        line_content_unit: string | null
      }
      const mapByKey = new Map<string, MapRow>()
      for (const r of mapRows ?? []) {
        const nm = String((r as any).supplier_item_name ?? '').trim()
        const ing = String((r as any).ingredient_id ?? '')
        const cf = Number((r as any).conversion_factor)
        if (!nm || !ing || !Number.isFinite(cf) || cf <= 0) continue
        mapByKey.set(`${nm}::${ing}`, {
          conversion_factor: cf,
          line_billing_unit: (r as any).line_billing_unit ?? null,
          line_content_qty:
            (r as any).line_content_qty == null ? null : Number((r as any).line_content_qty),
          line_content_unit: (r as any).line_content_unit ?? null,
        })
      }
      for (const ln of lines) {
        if (!ln.ingredient_id) continue
        const key = `${String(ln.original_name ?? '').trim()}::${ln.ingredient_id}`
        const m = mapByKey.get(key)
        if (!m) continue
        ln.conversion_factor = m.conversion_factor
        ln.line_billing_unit = m.line_billing_unit
        ln.line_content_qty = m.line_content_qty
        ln.line_content_unit = m.line_content_unit
      }
    }
  }

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
    extra_document_sheets: extra_document_sheets,
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

  const priceRes = await resyncIngredientPriceForMappedLine(gate.supabase, {
    supplierId,
    originalName,
    ingredientId,
    unitPrice,
  })
  if (!priceRes.ok) return { success: false, message: priceRes.message }
  if (priceRes.warning) return { success: true, warning: priceRes.warning }

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
  const lineIds = Array.from(new Set((params?.lineIds ?? []).map((x) => String(x ?? '').trim()).filter(Boolean)))
  if (lineIds.length === 0) return { success: true, statuses: [] }

  const ensure = await ensureStockMovementsReferenceDocColumn(gate.supabase)
  if (!ensure.ok) return { success: false, message: ensure.message }

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
  supplier_pricing_mode: string | null
  pack_units: number | null
  pack_unit_size_qty: number | null
  pack_unit_size_unit: string | null
}

// Fuente del match propuesto en la línea, de mayor a menor confianza.
//   - 'dictionary_exact' : ya existe fila en supplier_item_mappings con
//                          (supplier_id, supplier_item_name=original_name).
//                          Llevamos también factor + ingrediente conocidos.
//   - 'alias_fuzzy'      : no hay exacto, pero hay alias guardados para este
//                          proveedor cuyo texto se parece al original_name.
//                          Sugerimos el ingrediente del alias top y su factor.
//   - 'ingredient_fuzzy' : fallback contra el catálogo de ingredientes.
//   - 'none'             : sin sugerencia clara, mapeo manual.
export type MappingSource = 'dictionary_exact' | 'alias_fuzzy' | 'ingredient_fuzzy' | 'none'

export type ResolvedLineMapping = {
  source: MappingSource
  suggestedIngredientId: string | null
  suggestedFactor: number | null
  lineBillingUnit: string | null
  lineContentQty: number | null
  lineContentUnit: string | null
  /** Candidatos para mostrar en el desplegable de "Sugerencias". */
  candidates: IngredientCandidate[]
  /** Alias ya guardados para el ingrediente sugerido (variantes de nombre). */
  knownAliases: string[]
}

/**
 * Resuelve qué ingrediente y factor preseleccionar para una línea concreta de
 * un albarán. Cascada explícita:
 *
 * 1. supplier_item_mappings exacto (supplier_id, supplier_item_name).
 * 2. supplier_item_mappings del mismo proveedor con texto similar (alias).
 * 3. matchIngredientCandidates contra el catálogo de ingredientes.
 *
 * Se llama desde la UI al abrir el modal de mapeo o al cargar el detalle del
 * albarán, para que el operario VALIDE en lugar de seleccionar desde cero.
 */
export async function resolveLineMappingAction(params: {
  invoiceId: string
  lineId: string
}): Promise<{ success: true; result: ResolvedLineMapping } | { success: false; message: string }> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }

  const isManager = gate.role === 'manager' || gate.role === 'admin'
  const invoiceId = String(params?.invoiceId ?? '').trim()
  const lineId = String(params?.lineId ?? '').trim()
  if (!invoiceId || !lineId) return { success: false, message: 'Datos incompletos' }

  const { data: lineRow, error: lineErr } = await gate.supabase
    .from('purchase_invoice_lines')
    .select('original_name, line_unit')
    .eq('id', lineId)
    .maybeSingle()
  if (lineErr) return { success: false, message: lineErr.message }
  const originalName = String((lineRow as any)?.original_name ?? '').trim()
  const lineUnitFromInvoice = (lineRow as any)?.line_unit as string | null
  if (!originalName) {
    return {
      success: true,
      result: {
        source: 'none',
        suggestedIngredientId: null,
        suggestedFactor: null,
        lineBillingUnit: null,
        lineContentQty: null,
        lineContentUnit: null,
        candidates: [],
        knownAliases: [],
      },
    }
  }

  const { data: invRow, error: invErr } = await gate.supabase
    .from('purchase_invoices')
    .select('supplier_id')
    .eq('id', invoiceId)
    .maybeSingle()
  if (invErr) return { success: false, message: invErr.message }
  const supplierId = (invRow as any)?.supplier_id as number | null

  const { matchIngredientCandidates, pickSuggestedCandidate } = await import('@/lib/albaran-price-match')

  // Catálogo de ingredientes (lo necesitamos en cualquier rama para enriquecer
  // los candidatos con precio/unidad y para el fuzzy final).
  const { data: ingRows, error: ingErr } = await gate.supabase
    .from('ingredients')
    .select(
      'id, name, current_price, purchase_unit, supplier_pricing_mode, pack_units, pack_unit_size_qty, pack_unit_size_unit'
    )
    .order('name')
    .limit(4000)
  if (ingErr) return { success: false, message: ingErr.message }
  const ingredients = (ingRows ?? []).map((r: any) => ({
    id: String(r.id),
    name: String(r.name ?? ''),
    current_price: Number(r.current_price) || 0,
    purchase_unit: r.purchase_unit ?? 'kg',
    supplier_pricing_mode: r.supplier_pricing_mode ?? null,
    pack_units: r.pack_units ?? null,
    pack_unit_size_qty: r.pack_unit_size_qty ?? null,
    pack_unit_size_unit: r.pack_unit_size_unit ?? null,
  }))
  const ingredientById = new Map(ingredients.map((i) => [i.id, i]))

  const dimensionalFromMapping = (m: {
    line_billing_unit?: string | null
    line_content_qty?: number | null
    line_content_unit?: string | null
  }) => ({
    lineBillingUnit: (m.line_billing_unit as string | null) ?? null,
    lineContentQty:
      m.line_content_qty == null || !Number.isFinite(Number(m.line_content_qty))
        ? null
        : Number(m.line_content_qty),
    lineContentUnit: (m.line_content_unit as string | null) ?? null,
  })

  const enrichCandidates = (cands: { id: string; name: string; score: number }[]): IngredientCandidate[] =>
    cands.map((c) => {
      const row = ingredientById.get(c.id)
      return {
        id: c.id,
        name: row?.name ?? c.name,
        score: c.score,
        current_price: row?.current_price ?? 0,
        purchase_unit: row?.purchase_unit ?? 'kg',
        supplier_pricing_mode: row?.supplier_pricing_mode ?? null,
        pack_units: row?.pack_units ?? null,
        pack_unit_size_qty: row?.pack_unit_size_qty ?? null,
        pack_unit_size_unit: row?.pack_unit_size_unit ?? null,
      }
    })

  const aliasesOf = async (ingredientId: string | null): Promise<string[]> => {
    if (!ingredientId || supplierId == null) return []
    const { data, error } = await gate.supabase
      .from('supplier_item_mappings')
      .select('supplier_item_name')
      .eq('supplier_id', supplierId)
      .eq('ingredient_id', ingredientId)
      .limit(50)
    if (error) return []
    return (data ?? []).map((r: any) => String(r.supplier_item_name ?? '')).filter(Boolean)
  }

  // ────────────────────────────────────────────────────────────────────────
  // 1) Diccionario exacto (solo si hay proveedor).
  if (supplierId != null) {
    const { data: exact, error: exErr } = await gate.supabase
      .from('supplier_item_mappings')
      .select(
        'ingredient_id, conversion_factor, line_billing_unit, line_content_qty, line_content_unit'
      )
      .eq('supplier_id', supplierId)
      .eq('supplier_item_name', originalName)
      .maybeSingle()
    if (exErr) return { success: false, message: exErr.message }

    if (exact && (exact as any).ingredient_id) {
      const ingredientId = String((exact as any).ingredient_id)
      const factor = await effectiveConversionFactorForIngredient(
        gate.supabase,
        ingredientId,
        (exact as any).conversion_factor
      )
      const row = ingredientById.get(ingredientId)
      const aliases = await aliasesOf(ingredientId)
      const candidates: IngredientCandidate[] = row
        ? [
            {
              id: row.id,
              name: row.name,
              score: 100,
              current_price: row.current_price,
              purchase_unit: row.purchase_unit,
              supplier_pricing_mode: row.supplier_pricing_mode,
              pack_units: row.pack_units,
              pack_unit_size_qty: row.pack_unit_size_qty,
              pack_unit_size_unit: row.pack_unit_size_unit,
            },
          ]
        : []
      const dim = dimensionalFromMapping(exact as any)
      return {
        success: true,
        result: {
          source: 'dictionary_exact',
          suggestedIngredientId: ingredientId,
          suggestedFactor: factor,
          lineBillingUnit: dim.lineBillingUnit ?? lineUnitFromInvoice,
          lineContentQty: dim.lineContentQty,
          lineContentUnit: dim.lineContentUnit,
          candidates,
          knownAliases: aliases,
        },
      }
    }

    // 2) Alias del mismo proveedor por similitud con el original_name.
    //    Buscamos mapeos del proveedor y reusamos el scorer del fuzzy.
    const { data: supplierMaps, error: smErr } = await gate.supabase
      .from('supplier_item_mappings')
      .select(
        'supplier_item_name, ingredient_id, conversion_factor, line_billing_unit, line_content_qty, line_content_unit'
      )
      .eq('supplier_id', supplierId)
      .limit(2000)
    if (smErr) return { success: false, message: smErr.message }

    const aliasRows = (supplierMaps ?? [])
      .map((r: any) => ({
        ingredient_id: r.ingredient_id ? String(r.ingredient_id) : null,
        factor: Number(r.conversion_factor) || 1,
        alias: String(r.supplier_item_name ?? ''),
        line_billing_unit: r.line_billing_unit ?? null,
        line_content_qty: r.line_content_qty ?? null,
        line_content_unit: r.line_content_unit ?? null,
      }))
      .filter((r: { ingredient_id: string | null; alias: string }) => r.ingredient_id && r.alias)

    if (aliasRows.length > 0) {
      // Scoreamos cada alias como "ingrediente sintético" (id = ingredient_id)
      // y nos quedamos con el mejor; si supera el umbral del picker, sugerimos.
      const aliasMatches = matchIngredientCandidates(
        originalName,
        aliasRows.map((a) => ({ id: a.ingredient_id!, name: a.alias, current_price: 0, purchase_unit: 'kg' })),
        8
      )
      const bestAliasId = pickSuggestedCandidate(aliasMatches)
      if (bestAliasId) {
        const winner = aliasRows.find((a) => a.ingredient_id === bestAliasId) ?? null
        const aliases = await aliasesOf(bestAliasId)
        const row = ingredientById.get(bestAliasId)
        const candidates: IngredientCandidate[] = row
          ? [
              {
                id: row.id,
                name: row.name,
                score: aliasMatches[0]?.score ?? 80,
                current_price: row.current_price,
                purchase_unit: row.purchase_unit,
                supplier_pricing_mode: row.supplier_pricing_mode,
                pack_units: row.pack_units,
                pack_unit_size_qty: row.pack_unit_size_qty,
                pack_unit_size_unit: row.pack_unit_size_unit,
              },
            ]
          : []
        const dim = winner ? dimensionalFromMapping(winner) : { lineBillingUnit: null, lineContentQty: null, lineContentUnit: null }
        return {
          success: true,
          result: {
            source: 'alias_fuzzy',
            suggestedIngredientId: bestAliasId,
            suggestedFactor: winner?.factor ?? 1,
            lineBillingUnit: dim.lineBillingUnit ?? lineUnitFromInvoice,
            lineContentQty: dim.lineContentQty,
            lineContentUnit: dim.lineContentUnit,
            candidates,
            knownAliases: aliases,
          },
        }
      }
    }
  }

  // 3) Fallback: similitud contra el catálogo de ingredientes.
  const fuzzy = matchIngredientCandidates(originalName, ingredients, 8)
  const suggested = pickSuggestedCandidate(fuzzy)
  const candidates = enrichCandidates(fuzzy)
  const aliases = await aliasesOf(suggested)
  const suggestedFactor = suggested
    ? await effectiveConversionFactorForIngredient(gate.supabase, suggested, 1)
    : null
  return {
    success: true,
    result: {
      source: suggested ? 'ingredient_fuzzy' : 'none',
      suggestedIngredientId: suggested,
      suggestedFactor,
      lineBillingUnit: lineUnitFromInvoice,
      lineContentQty: null,
      lineContentUnit: null,
      candidates,
      knownAliases: aliases,
    },
  }
}

/**
 * Compatibilidad: la UI antigua usa esta acción. Sigue funcionando, pero la
 * pantalla de albaranes ya llama directamente a `resolveLineMappingAction`.
 */
export async function suggestIngredientsForLineAction(params: {
  extractedName: string
}): Promise<
  | { success: true; suggestedIngredientId: string | null; candidates: IngredientCandidate[] }
  | { success: false; message: string }
> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }

  const isManager = gate.role === 'manager' || gate.role === 'admin'
  const extractedName = String(params?.extractedName ?? '').trim()
  if (!extractedName) return { success: true, suggestedIngredientId: null, candidates: [] }

  const { matchIngredientCandidates, pickSuggestedCandidate } = await import('@/lib/albaran-price-match')

  const { data: ingRows, error } = await gate.supabase
    .from('ingredients')
    .select(
      'id, name, current_price, purchase_unit, supplier_pricing_mode, pack_units, pack_unit_size_qty, pack_unit_size_unit'
    )
    .order('name')
    .limit(4000)
  if (error) return { success: false, message: error.message }

  const ingredients = (ingRows ?? []).map((r: any) => ({
    id: String(r.id),
    name: String(r.name ?? ''),
    current_price: Number(r.current_price) || 0,
    purchase_unit: String(r.purchase_unit ?? 'kg'),
    supplier_pricing_mode: r.supplier_pricing_mode != null ? String(r.supplier_pricing_mode) : null,
    pack_units: r.pack_units != null ? Number(r.pack_units) : null,
    pack_unit_size_qty: r.pack_unit_size_qty != null ? Number(r.pack_unit_size_qty) : null,
    pack_unit_size_unit: r.pack_unit_size_unit != null ? String(r.pack_unit_size_unit) : null,
  }))

  const cands = matchIngredientCandidates(extractedName, ingredients, 8)
  const suggested = pickSuggestedCandidate(cands)

  const enriched: IngredientCandidate[] = cands.map((c) => {
    const row = ingredients.find((i) => i.id === c.id)
    return {
      id: c.id,
      name: row?.name ?? c.name,
      score: c.score,
      current_price: row?.current_price ?? 0,
      purchase_unit: row?.purchase_unit ?? 'kg',
      supplier_pricing_mode: row?.supplier_pricing_mode ?? null,
      pack_units: row?.pack_units ?? null,
      pack_unit_size_qty: row?.pack_unit_size_qty ?? null,
      pack_unit_size_unit: row?.pack_unit_size_unit ?? null,
    }
  })

  return { success: true, suggestedIngredientId: suggested, candidates: enriched }
}

export async function searchIngredientsForMappingAction(params: {
  query: string
  limit?: number
}): Promise<
  | {
      success: true
      items: {
        id: string
        name: string
        purchase_unit: string
        current_price: number
        supplier_pricing_mode: string | null
        pack_units: number | null
        pack_unit_size_qty: number | null
        pack_unit_size_unit: string | null
      }[]
    }
  | { success: false; message: string }
> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }

  const isManager = gate.role === 'manager' || gate.role === 'admin'
  const q = String(params?.query ?? '').trim()
  if (q.length < 2) return { success: true, items: [] }
  const limit = Math.min(Math.max(Number(params?.limit ?? 30) || 30, 1), 200)

  const { data, error } = await gate.supabase
    .from('ingredients')
    .select(
      'id,name,purchase_unit,current_price,supplier_pricing_mode,pack_units,pack_unit_size_qty,pack_unit_size_unit'
    )
    .ilike('name', `%${q}%`)
    .order('name')
    .limit(limit)
  if (error) return { success: false, message: error.message }

  const items = (data ?? []).map((r: any) => ({
    id: String(r.id),
    name: String(r.name ?? ''),
    purchase_unit: r.purchase_unit ?? 'kg',
    current_price: Number(r.current_price) || 0,
    supplier_pricing_mode: r.supplier_pricing_mode ?? null,
    pack_units: r.pack_units == null ? null : Number(r.pack_units),
    pack_unit_size_qty: r.pack_unit_size_qty == null ? null : Number(r.pack_unit_size_qty),
    pack_unit_size_unit: r.pack_unit_size_unit ?? null,
  }))

  return { success: true, items }
}

export async function confirmInvoiceLineMappingAction(params: {
  lineId: string
  invoiceId: string
  ingredientId: string
  conversionFactor: number
  lineBillingUnit?: string | null
  lineContentQty?: number | null
  lineContentUnit?: string | null
}): Promise<{ success: true } | { success: false; message: string }> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }

  const isManager = gate.role === 'manager' || gate.role === 'admin'
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

  const effectiveFactor = await effectiveConversionFactorForIngredient(gate.supabase, ingredientId, factor)

  // 1) Aprendizaje: diccionario proveedor+texto -> ingrediente+factor
  const { error: mapErr } = await gate.supabase
    .from('supplier_item_mappings')
    .upsert(
      {
        supplier_id: supplierId,
        supplier_item_name: originalName,
        ingredient_id: ingredientId,
        conversion_factor: effectiveFactor,
        line_billing_unit: params.lineBillingUnit || null,
        line_content_qty: params.lineContentQty || null,
        line_content_unit: params.lineContentUnit || null,
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

  const unitPrice = (line as any)?.unit_price as number | null
  const priceRes = await resyncIngredientPriceForMappedLine(gate.supabase, {
    supplierId,
    originalName,
    ingredientId,
    unitPrice,
  })
  if (!priceRes.ok) return { success: false, message: priceRes.message }

  await syncPurchaseInvoiceStatusRpc(gate.supabase, invoiceId)

  // 3) Revalidaciones para refrescar UI
  try {
    revalidatePath('/dashboard/albaranes')
  } catch {}

  return { success: true }
}

/**
 * Corrige el factor de conversión aprendido para una línea **ya mapeada**,
 * re-sincroniza precio del ingrediente (salvo `price_locked`) y, si ya hubo
 * entrada `PURCHASE` `ALB-LINE-<lineId>`, rectifica la cantidad aplicada.
 */
export async function updateMappedLineConversionFactorAction(params: {
  invoiceId: string
  lineId: string
  conversionFactor: number
  lineBillingUnit?: string | null
  lineContentQty?: number | null
  lineContentUnit?: string | null
}): Promise<
  { success: true; warning?: string; stockRectified: boolean } | { success: false; message: string }
> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }

  const isManager = gate.role === 'manager' || gate.role === 'admin'
  const invoiceId = String(params?.invoiceId ?? '').trim()
  const lineId = String(params?.lineId ?? '').trim()
  const factor = Number(params?.conversionFactor)

  if (!invoiceId || !lineId) return { success: false, message: 'Datos incompletos' }
  if (!Number.isFinite(factor) || factor <= 0) return { success: false, message: 'Factor inválido' }

  const { data: lineRow, error: lineErr } = await gate.supabase
    .from('purchase_invoice_lines')
    .select('id, invoice_id, original_name, quantity, unit_price, mapped_ingredient_id, status')
    .eq('id', lineId)
    .maybeSingle()
  if (lineErr) return { success: false, message: lineErr.message }
  if (!lineRow) return { success: false, message: 'Línea no encontrada' }

  const rowInv = String((lineRow as any).invoice_id ?? '').trim()
  if (rowInv !== invoiceId) return { success: false, message: 'La línea no pertenece a este albarán' }

  const status = String((lineRow as any).status ?? '')
  const ingredientId = String((lineRow as any).mapped_ingredient_id ?? '').trim()
  if (status !== 'mapped' || !ingredientId) {
    return { success: false, message: 'Solo se puede corregir el factor en líneas ya mapeadas.' }
  }

  const originalName = String((lineRow as any).original_name ?? '').trim()
  if (!originalName) return { success: false, message: 'La línea no tiene nombre' }

  const { data: inv, error: invErr } = await gate.supabase.from('purchase_invoices').select('supplier_id').eq('id', invoiceId).maybeSingle()
  if (invErr) return { success: false, message: invErr.message }
  const supplierId = (inv as any)?.supplier_id as number | null
  if (supplierId == null) return { success: false, message: 'Este albarán no tiene proveedor asignado.' }

  const unitPrice = (lineRow as any).unit_price as number | null

  const { error: mapErr } = await gate.supabase.from('supplier_item_mappings').upsert(
    {
      supplier_id: supplierId,
      supplier_item_name: originalName,
      ingredient_id: ingredientId,
      conversion_factor: factor,
      line_billing_unit: params.lineBillingUnit || null,
      line_content_qty: params.lineContentQty || null,
      line_content_unit: params.lineContentUnit || null,
      last_known_price: unitPrice ?? null,
    },
    { onConflict: 'supplier_id,supplier_item_name' }
  )
  if (mapErr) return { success: false, message: `Error guardando factor: ${mapErr.message}` }

  const priceRes = await resyncIngredientPriceForMappedLine(gate.supabase, {
    supplierId,
    originalName,
    ingredientId,
    unitPrice,
  })
  if (!priceRes.ok) return { success: false, message: priceRes.message }

  const ensureCol = await ensureStockMovementsReferenceDocColumn(gate.supabase)
  if (!ensureCol.ok) return { success: false, message: ensureCol.message }

  let stockRectified = false
  const baseRef = `ALB-LINE-${lineId}`
  const { data: applied, error: appErr } = await gate.supabase
    .from('stock_movements')
    .select('quantity')
    .eq('movement_type', 'PURCHASE')
    .eq('ingredient_id', ingredientId)
    .eq('reference_doc', baseRef)
    .maybeSingle()
  if (appErr) return { success: false, message: appErr.message }

  const oldApplied = Number((applied as any)?.quantity)
  if (Number.isFinite(oldApplied) && oldApplied > 0) {
    const lineQty = Number((lineRow as any).quantity)
    if (!Number.isFinite(lineQty) || lineQty <= 0) {
      return {
        success: false,
        message:
          'Hay stock aplicado y la línea no tiene cantidad válida: corrige la cantidad en la línea o usa «Rectificar stock».',
      }
    }
    const contentQty = params.lineContentQty
    const effectiveQtyPerUnit =
      contentQty != null && Number.isFinite(contentQty) && contentQty > 0 ? contentQty : factor
    const newQty = lineQty * effectiveQtyPerUnit
    if (Math.abs(newQty - oldApplied) > 1e-6) {
      const rect = await rectifyInvoiceLineStockAction({ lineId, ingredientId, newQtyApplied: newQty })
      if (!rect.success) return { success: false, message: rect.message }
      stockRectified = true
    }
  }

  await syncPurchaseInvoiceStatusRpc(gate.supabase, invoiceId)

  try {
    revalidatePath('/dashboard/albaranes')
  } catch {}

  return { success: true, warning: priceRes.warning, stockRectified }
}

export async function rectifyInvoiceLineStockAction(params: {
  lineId: string
  ingredientId: string
  newQtyApplied: number
}): Promise<{ success: true } | { success: false; message: string }> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }

  const isManager = gate.role === 'manager' || gate.role === 'admin'
  const lineId = String(params?.lineId ?? '').trim()
  const ingredientId = String(params?.ingredientId ?? '').trim()
  const newQty = Number(params?.newQtyApplied)
  if (!lineId || !ingredientId) return { success: false, message: 'Datos incompletos' }
  if (!Number.isFinite(newQty) || newQty <= 0) return { success: false, message: 'Cantidad nueva inválida' }

  const ensureCol = await ensureStockMovementsReferenceDocColumn(gate.supabase)
  if (!ensureCol.ok) return { success: false, message: ensureCol.message }

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

export async function applyInvoiceLineStockAction(params: {
  invoiceId: string
  lineId: string
}): Promise<{ success: true; appliedQty: number } | { success: false; message: string }> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }

  const isManager = gate.role === 'manager' || gate.role === 'admin'
  const invoiceId = String(params?.invoiceId ?? '').trim()
  const lineId = String(params?.lineId ?? '').trim()
  if (!invoiceId || !lineId) return { success: false, message: 'Datos incompletos' }

  // Proveedor obligatorio
  const { data: inv, error: invErr } = await gate.supabase.from('purchase_invoices').select('supplier_id').eq('id', invoiceId).maybeSingle()
  if (invErr) return { success: false, message: invErr.message }
  const supplierId = (inv as any)?.supplier_id as number | null
  if (supplierId == null) return { success: false, message: 'Este albarán no tiene proveedor asignado.' }

  // Leer línea: requiere match + cantidad + nombre original
  const { data: line, error: lineErr } = await gate.supabase
    .from('purchase_invoice_lines')
    .select('id, original_name, quantity, mapped_ingredient_id, status')
    .eq('id', lineId)
    .maybeSingle()
  if (lineErr) return { success: false, message: lineErr.message }
  const originalName = String((line as any)?.original_name ?? '').trim()
  const qty = Number((line as any)?.quantity)
  const ingredientId = String((line as any)?.mapped_ingredient_id ?? '').trim()
  if (!ingredientId) return { success: false, message: 'La línea no tiene ingrediente asignado.' }
  if (!originalName) return { success: false, message: 'La línea no tiene nombre.' }
  if (!Number.isFinite(qty) || qty <= 0) return { success: false, message: 'Cantidad inválida en la línea.' }

  // Factor desde el diccionario (debe existir)
  const { data: map, error: mapErr } = await gate.supabase
    .from('supplier_item_mappings')
    .select('conversion_factor')
    .eq('supplier_id', supplierId)
    .eq('supplier_item_name', originalName)
    .eq('ingredient_id', ingredientId)
    .maybeSingle()
  if (mapErr) return { success: false, message: mapErr.message }
  const factor = Number((map as any)?.conversion_factor)
  if (!Number.isFinite(factor) || factor <= 0) return { success: false, message: 'Falta factor de conversión (mapeo incompleto).' }

  const appliedQty = qty * factor
  if (!Number.isFinite(appliedQty) || appliedQty <= 0) return { success: false, message: 'Cantidad aplicada inválida.' }

  const ensureCol = await ensureStockMovementsReferenceDocColumn(gate.supabase)
  if (!ensureCol.ok) return { success: false, message: ensureCol.message }

  // Unidad del ingrediente (unit)
  const { data: ing, error: ingErr } = await gate.supabase.from('ingredients').select('unit').eq('id', ingredientId).maybeSingle()
  if (ingErr) return { success: false, message: ingErr.message }
  const unit = String((ing as any)?.unit ?? 'ud') || 'ud'

  const ref = `ALB-LINE-${lineId}`

  // Idempotencia: no duplicar
  const { data: existing, error: exErr } = await gate.supabase
    .from('stock_movements')
    .select('id')
    .eq('movement_type', 'PURCHASE')
    .eq('ingredient_id', ingredientId)
    .eq('reference_doc', ref)
    .limit(1)
    .maybeSingle()
  if (exErr) return { success: false, message: exErr.message }
  if (existing?.id) return { success: false, message: 'Ya estaba aplicado a stock.' }

  const { error: insErr } = await gate.supabase.from('stock_movements').insert({
    movement_type: 'PURCHASE',
    ingredient_id: ingredientId,
    quantity: appliedQty,
    unit,
    movement_date: new Date().toISOString(),
    reference_doc: ref,
    original_description: `Recepción (manual): ${originalName}`,
    processed_by: 'Albaranes-UI',
  })
  if (insErr) return { success: false, message: insErr.message }

  // Asegurar status='mapped' si estaba inconsistente
  if (String((line as any)?.status ?? '') !== 'mapped') {
    await gate.supabase.from('purchase_invoice_lines').update({ status: 'mapped' }).eq('id', lineId)
  }

  const invoiceIdFromLine = String((line as any)?.invoice_id ?? invoiceId ?? '').trim()
  if (invoiceIdFromLine) await syncPurchaseInvoiceStatusRpc(gate.supabase, invoiceIdFromLine)

  try {
    revalidatePath('/dashboard/albaranes')
  } catch {}

  return { success: true, appliedQty: Math.round(appliedQty * 1000) / 1000 }
}

type RepairOrphanInnerResult =
  | { ok: true; appliedQty: number; alreadyApplied?: boolean; createdDictionaryEntry?: boolean; priceWarning?: string }
  | { ok: false; message: string }

/**
 * Inserta el PURCHASE faltante para una línea ya `mapped` con ingrediente pero
 * sin movimiento `ALB-LINE-<id>` (p. ej. trigger saltado, proveedor asignado
 * tarde, o histórico previo al trigger). Idempotente.
 *
 * Si no hay fila en `supplier_item_mappings` compatible, crea una con
 * `conversion_factor = 1` (el caller puede avisar en toast para revisión).
 */
async function repairOrphanLineStockInner(
  supabase: SupabaseServerClient,
  lineId: string
): Promise<RepairOrphanInnerResult> {
  const ensureCol = await ensureStockMovementsReferenceDocColumn(supabase)
  if (!ensureCol.ok) return { ok: false, message: ensureCol.message }

  const { data: line, error: lineErr } = await supabase
    .from('purchase_invoice_lines')
    .select('id, invoice_id, original_name, quantity, mapped_ingredient_id, status, unit_price')
    .eq('id', lineId)
    .maybeSingle()
  if (lineErr) return { ok: false, message: lineErr.message }
  if (!line) return { ok: false, message: 'Línea no encontrada' }

  const invoiceId = String((line as any).invoice_id ?? '').trim()
  const status = String((line as any).status ?? '')
  const ingredientId = String((line as any).mapped_ingredient_id ?? '').trim()
  if (status !== 'mapped' || !ingredientId) {
    return { ok: false, message: 'Solo se repara stock en líneas ya mapeadas y confirmadas.' }
  }

  const { data: inv, error: invErr } = await supabase.from('purchase_invoices').select('supplier_id').eq('id', invoiceId).maybeSingle()
  if (invErr) return { ok: false, message: invErr.message }
  const supplierId = (inv as any)?.supplier_id as number | null
  if (supplierId == null) {
    return { ok: false, message: 'Asigna un proveedor al albarán (cabecera) y vuelve a pulsar.' }
  }

  const originalName = String((line as any)?.original_name ?? '').trim()
  if (!originalName) return { ok: false, message: 'La línea no tiene nombre de producto.' }

  const lineQty = Number((line as any)?.quantity)
  if (!Number.isFinite(lineQty) || lineQty <= 0) {
    return { ok: false, message: 'Indica una cantidad válida en la línea antes de aplicar stock.' }
  }

  const ref = `ALB-LINE-${lineId}`
  const { data: existing, error: exErr } = await supabase
    .from('stock_movements')
    .select('quantity')
    .eq('movement_type', 'PURCHASE')
    .eq('ingredient_id', ingredientId)
    .eq('reference_doc', ref)
    .maybeSingle()
  if (exErr) return { ok: false, message: exErr.message }
  const existingQty = Number((existing as any)?.quantity)
  if (Number.isFinite(existingQty) && existingQty > 0) {
    return { ok: true, appliedQty: Math.round(existingQty * 1000) / 1000, alreadyApplied: true }
  }

  let createdDictionaryEntry = false
  const { data: mapRow, error: mapErr } = await supabase
    .from('supplier_item_mappings')
    .select('conversion_factor')
    .eq('supplier_id', supplierId)
    .eq('supplier_item_name', originalName)
    .eq('ingredient_id', ingredientId)
    .maybeSingle()
  if (mapErr) return { ok: false, message: mapErr.message }

  let factor = Number((mapRow as any)?.conversion_factor)
  if (!Number.isFinite(factor) || factor <= 0) {
    const unitPrice = (line as any).unit_price as number | null
    const { error: upErr } = await supabase.from('supplier_item_mappings').upsert(
      {
        supplier_id: supplierId,
        supplier_item_name: originalName,
        ingredient_id: ingredientId,
        conversion_factor: 1,
        last_known_price: unitPrice != null && Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : null,
      },
      { onConflict: 'supplier_id,supplier_item_name' }
    )
    if (upErr) return { ok: false, message: `No hay factor guardado y no se pudo crear el diccionario: ${upErr.message}` }
    createdDictionaryEntry = true
    factor = 1
  }

  const appliedQty = lineQty * factor
  if (!Number.isFinite(appliedQty) || appliedQty <= 0) {
    return { ok: false, message: 'La cantidad aplicada sería 0; revisa cantidad o factor de conversión.' }
  }

  const { data: ing, error: ingErr } = await supabase.from('ingredients').select('unit').eq('id', ingredientId).maybeSingle()
  if (ingErr) return { ok: false, message: ingErr.message }
  const unit = String((ing as any)?.unit ?? 'ud') || 'ud'

  const { error: insErr } = await supabase.from('stock_movements').insert({
    movement_type: 'PURCHASE',
    ingredient_id: ingredientId,
    quantity: appliedQty,
    unit,
    movement_date: new Date().toISOString(),
    reference_doc: ref,
    original_description: `Recepción (reparación): ${originalName}`,
    processed_by: 'Albaranes-Reparar',
  })
  if (insErr) return { ok: false, message: insErr.message }

  const priceRes = await resyncIngredientPriceForMappedLine(supabase, {
    supplierId,
    originalName,
    ingredientId,
    unitPrice: (line as any).unit_price as number | null,
  })
  if (!priceRes.ok) return { ok: false, message: priceRes.message }

  return {
    ok: true,
    appliedQty: Math.round(appliedQty * 1000) / 1000,
    createdDictionaryEntry,
    priceWarning: priceRes.warning,
  }
}

export async function repairOrphanLineStockAction(params: {
  lineId: string
}): Promise<
  | { success: true; appliedQty: number; alreadyApplied?: boolean; createdDictionaryEntry?: boolean; priceWarning?: string }
  | { success: false; message: string }
> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }

  const isManager = gate.role === 'manager' || gate.role === 'admin'
  const lineId = String(params?.lineId ?? '').trim()
  if (!lineId) return { success: false, message: 'ID de línea inválido' }

  const inner = await repairOrphanLineStockInner(gate.supabase, lineId)
  if (!inner.ok) return { success: false, message: inner.message }

  try {
    revalidatePath('/dashboard/albaranes')
  } catch {}

  return {
    success: true,
    appliedQty: inner.appliedQty,
    alreadyApplied: inner.alreadyApplied,
    createdDictionaryEntry: inner.createdDictionaryEntry,
    priceWarning: inner.priceWarning,
  }
}

export type RepairOrphanInvoiceReport = {
  repaired: number
  alreadyOk: number
  failed: number
  firstErrors: string[]
}

/** Repara todas las líneas `mapped` del albarán que aún no tienen PURCHASE `ALB-LINE-*`. */
export async function repairOrphanLinesInInvoiceAction(params: {
  invoiceId: string
}): Promise<{ success: true; report: RepairOrphanInvoiceReport } | { success: false; message: string }> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }

  const isManager = gate.role === 'manager' || gate.role === 'admin'
  const invoiceId = String(params?.invoiceId ?? '').trim()
  if (!invoiceId) return { success: false, message: 'ID de albarán inválido' }

  const { data: rows, error: listErr } = await gate.supabase
    .from('purchase_invoice_lines')
    .select('id')
    .eq('invoice_id', invoiceId)
    .eq('status', 'mapped')
    .not('mapped_ingredient_id', 'is', null)
  if (listErr) return { success: false, message: listErr.message }

  const report: RepairOrphanInvoiceReport = { repaired: 0, alreadyOk: 0, failed: 0, firstErrors: [] }
  for (const r of rows ?? []) {
    const lid = String((r as any).id ?? '').trim()
    if (!lid) continue
    const inner = await repairOrphanLineStockInner(gate.supabase, lid)
    if (!inner.ok) {
      report.failed += 1
      if (report.firstErrors.length < 5) report.firstErrors.push(`${lid.slice(0, 8)}…: ${inner.message}`)
      continue
    }
    if (inner.alreadyApplied) report.alreadyOk += 1
    else report.repaired += 1
  }

  await syncPurchaseInvoiceStatusRpc(gate.supabase, invoiceId)

  try {
    revalidatePath('/dashboard/albaranes')
  } catch {}

  return { success: true, report }
}

// ─────────────────────────────────────────────────────────────────────────────
// Excluir línea del mapeo (portes, sin cargo, ajustes…)
//
// Marca status='excluded' sin ingrediente ni stock. Cuenta como resuelta para
// el tick verde del albarán.
// ─────────────────────────────────────────────────────────────────────────────

export async function excludeInvoiceLineFromMappingAction(params: {
  lineId: string
}): Promise<{ success: true } | { success: false; message: string }> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }

  const lineId = String(params?.lineId ?? '').trim()
  if (!lineId) return { success: false, message: 'ID de línea inválido' }

  const { data: line, error: lineErr } = await gate.supabase
    .from('purchase_invoice_lines')
    .select('id, invoice_id, mapped_ingredient_id, status')
    .eq('id', lineId)
    .maybeSingle()
  if (lineErr) return { success: false, message: lineErr.message }
  if (!line) return { success: false, message: 'Línea no encontrada' }

  const invoiceId = String((line as any).invoice_id ?? '').trim()

  const hadMapping =
    Boolean((line as any).mapped_ingredient_id) && String((line as any).status ?? '') === 'mapped'

  if (hadMapping) {
    const { error: rpcErr } = await gate.supabase.rpc('delete_stock_movements_for_albaran_line', {
      p_line_id: lineId,
    })
    if (rpcErr) {
      const msg = String(rpcErr.message ?? '')
      if (!/could not find the function|PGRST202|function .* does not exist/i.test(msg)) {
        return { success: false, message: `Error borrando stock: ${msg}` }
      }
    }
  }

  const { error: updErr } = await gate.supabase
    .from('purchase_invoice_lines')
    .update({ mapped_ingredient_id: null, status: INVOICE_LINE_STATUS_EXCLUDED })
    .eq('id', lineId)
  if (updErr) return { success: false, message: `Error actualizando línea: ${updErr.message}` }

  if (invoiceId) await syncPurchaseInvoiceStatusRpc(gate.supabase, invoiceId)

  try {
    revalidatePath('/dashboard/albaranes')
  } catch {}

  return { success: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// Marcar línea como gasto (sin stock)
//
// status='expense_only' sin ingrediente ni stock. Cuenta como resuelta para
// la sincronización de cabecera `mapped` y para PyG.
// ─────────────────────────────────────────────────────────────────────────────

export async function markInvoiceLineExpenseOnlyAction(params: {
  lineId: string
}): Promise<{ success: true } | { success: false; message: string }> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }

  const lineId = String(params?.lineId ?? '').trim()
  if (!lineId) return { success: false, message: 'ID de línea inválido' }

  const { data: line, error: lineErr } = await gate.supabase
    .from('purchase_invoice_lines')
    .select('id, invoice_id, mapped_ingredient_id, status')
    .eq('id', lineId)
    .maybeSingle()
  if (lineErr) return { success: false, message: lineErr.message }
  if (!line) return { success: false, message: 'Línea no encontrada' }

  const invoiceId = String((line as any).invoice_id ?? '').trim()

  const hadMapping =
    Boolean((line as any).mapped_ingredient_id) && String((line as any).status ?? '') === 'mapped'

  if (hadMapping) {
    const { error: rpcErr } = await gate.supabase.rpc('delete_stock_movements_for_albaran_line', {
      p_line_id: lineId,
    })
    if (rpcErr) {
      const msg = String(rpcErr.message ?? '')
      if (!/could not find the function|PGRST202|function .* does not exist/i.test(msg)) {
        return { success: false, message: `Error borrando stock: ${msg}` }
      }
    }
  }

  const { error: updErr } = await gate.supabase
    .from('purchase_invoice_lines')
    .update({ mapped_ingredient_id: null, status: INVOICE_LINE_STATUS_EXPENSE_ONLY })
    .eq('id', lineId)
  if (updErr) return { success: false, message: `Error actualizando línea: ${updErr.message}` }

  if (invoiceId) await syncPurchaseInvoiceStatusRpc(gate.supabase, invoiceId)

  try {
    revalidatePath('/dashboard/albaranes')
  } catch {}

  return { success: true }
}

export async function restoreInvoiceLineFromExpenseOnlyAction(params: {
  lineId: string
}): Promise<{ success: true } | { success: false; message: string }> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }

  const lineId = String(params?.lineId ?? '').trim()
  if (!lineId) return { success: false, message: 'ID de línea inválido' }

  const { data: line, error: lineErr } = await gate.supabase
    .from('purchase_invoice_lines')
    .select('id, invoice_id, status')
    .eq('id', lineId)
    .maybeSingle()
  if (lineErr) return { success: false, message: lineErr.message }
  if (!line) return { success: false, message: 'Línea no encontrada' }

  const status = String((line as any).status ?? '')
  if (status !== INVOICE_LINE_STATUS_EXPENSE_ONLY) {
    return { success: false, message: 'La línea no está marcada como gasto.' }
  }

  const invoiceId = String((line as any).invoice_id ?? '').trim()

  const { error: updErr } = await gate.supabase
    .from('purchase_invoice_lines')
    .update({ mapped_ingredient_id: null, status: 'pending' })
    .eq('id', lineId)
  if (updErr) return { success: false, message: `Error actualizando línea: ${updErr.message}` }

  if (invoiceId) await syncPurchaseInvoiceStatusRpc(gate.supabase, invoiceId)

  try {
    revalidatePath('/dashboard/albaranes')
  } catch {}

  return { success: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// Deshacer match de una línea (con reversión de stock)
//
// Caso de uso: el operario detecta que el match fue erróneo. Necesitamos:
//   1. Eliminar los movimientos `stock_movements` generados por esa línea
//      (PURCHASE base + cualquier ADJUSTMENT `…-REV%`).
//   2. Volver la línea a `status='pending'`, `mapped_ingredient_id=null`.
//   3. Opcionalmente borrar el aprendizaje en `supplier_item_mappings` para
//      que el sistema no vuelva a auto-aplicar el mismo error en el futuro.
//
// La UI usa esto en dos botones:
//   - "Editar match"   → unmap (sin borrar dict) y reabre el modal de mapping.
//   - "Eliminar match" → unmap + removeFromDictionary=true.
// ─────────────────────────────────────────────────────────────────────────────

export async function unmapInvoiceLineAction(params: {
  lineId: string
  removeFromDictionary?: boolean
}): Promise<{ success: true; deletedMovements: number } | { success: false; message: string }> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }

  const isManager = gate.role === 'manager' || gate.role === 'admin'
  const lineId = String(params?.lineId ?? '').trim()
  if (!lineId) return { success: false, message: 'ID de línea inválido' }

  // Leer la línea (necesitamos original_name + invoice_id para opcional dict).
  const { data: line, error: lineErr } = await gate.supabase
    .from('purchase_invoice_lines')
    .select('id, invoice_id, original_name, mapped_ingredient_id')
    .eq('id', lineId)
    .maybeSingle()
  if (lineErr) return { success: false, message: lineErr.message }
  if (!line) return { success: false, message: 'Línea no encontrada' }

  const invoiceId = String((line as any).invoice_id ?? '').trim()
  const originalName = String((line as any).original_name ?? '').trim()

  // 1) Stock: mismo criterio que al borrar albarán completo (RPC, no PostgREST .delete).
  const { data: rpcDel, error: rpcErr } = await gate.supabase.rpc('delete_stock_movements_for_albaran_line', {
    p_line_id: lineId,
  })
  if (rpcErr) {
    const msg = String(rpcErr.message ?? '')
    if (/could not find the function|PGRST202|function .* does not exist/i.test(msg)) {
      return {
        success: false,
        message: `Error borrando stock: falta la función en BD. Ejecuta supabase/migrations/20260517140000_delete_albaran_stock_movements_rpc.sql o supabase db push. (${msg})`,
      }
    }
    return { success: false, message: `Error borrando stock: ${msg}` }
  }
  const deletedMovements = Number(rpcDel ?? 0) || 0

  // 2) Volver la línea a pending. NOTA: el trigger BD que dispara stock solo
  //    actúa cuando una línea PASA a `status='mapped'` con mapped_ingredient_id,
  //    así que poner ambos a null/pending no regenera movimientos.
  const { error: updErr } = await gate.supabase
    .from('purchase_invoice_lines')
    .update({ mapped_ingredient_id: null, status: 'pending' })
    .eq('id', lineId)
  if (updErr) return { success: false, message: `Error actualizando línea: ${updErr.message}` }

  // 3) Borrado opcional del aprendizaje en supplier_item_mappings.
  if (params?.removeFromDictionary && invoiceId && originalName) {
    const { data: invRow, error: invErr } = await gate.supabase
      .from('purchase_invoices')
      .select('supplier_id')
      .eq('id', invoiceId)
      .maybeSingle()
    if (!invErr) {
      const supplierId = (invRow as any)?.supplier_id as number | null
      if (supplierId != null) {
        const { error: dictErr } = await gate.supabase
          .from('supplier_item_mappings')
          .delete()
          .eq('supplier_id', supplierId)
          .eq('supplier_item_name', originalName)
        if (dictErr) {
          // No bloqueamos: el unmap principal ya funcionó. Avisamos por log.
          console.warn('unmapInvoiceLineAction: dict delete warning', dictErr.message)
        }
      }
    }
  }

  if (invoiceId) await syncPurchaseInvoiceStatusRpc(gate.supabase, invoiceId)

  try {
    revalidatePath('/dashboard/albaranes')
  } catch {}

  return { success: true, deletedMovements }
}

// ─────────────────────────────────────────────────────────────────────────────
// Eliminar albarán completo (con reversión de stock)
//
// Política: cuando se borra un albarán, deben desaparecer también sus efectos
// en stock. Para mantener la auditoría limpia, optamos por DELETE puro de los
// movimientos asociados (PURCHASE base + cualquier ADJUSTMENT con prefijo
// `ALB-LINE-<lineId>%`, incluyendo REV) en lugar de generar ajustes inversos
// que dejarían "rastros" sin albarán al que asociar.
//
// La eliminación de la cabecera + líneas + storage también se hace en cascada.
// La constraint FK en `purchase_invoice_lines.invoice_id` tiene ON DELETE
// CASCADE, así que basta con borrar la cabecera tras retirar los movimientos.
// ─────────────────────────────────────────────────────────────────────────────

export async function deletePurchaseInvoiceAction(params: {
  invoiceId: string
}): Promise<
  | { success: true; deletedMovements: number; deletedLines: number }
  | { success: false; message: string }
> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }

  // Acción destructiva: SOLO manager/admin pueden eliminar un albarán
  // completo (revierte stock y borra líneas + cabecera + archivo).
  const isManager = gate.role === 'manager' || gate.role === 'admin'
  if (!isManager) return { success: false, message: 'Solo manager puede eliminar un albarán' }

  const invoiceId = String(params?.invoiceId ?? '').trim()
  if (!invoiceId) return { success: false, message: 'ID de albarán inválido' }

  // 1) Leer cabecera (file_path) y todas las líneas asociadas (para sus IDs).
  const { data: inv, error: invErr } = await gate.supabase
    .from('purchase_invoices')
    .select('id, file_path')
    .eq('id', invoiceId)
    .maybeSingle()
  if (invErr) return { success: false, message: invErr.message }
  if (!inv) return { success: false, message: 'Albarán no encontrado o sin permiso' }

  const filePath = (inv as any).file_path as string | null

  const { data: linesData, error: linesErr } = await gate.supabase
    .from('purchase_invoice_lines')
    .select('id')
    .eq('invoice_id', invoiceId)
    .limit(20000)
  if (linesErr) return { success: false, message: linesErr.message }
  const lineIds = ((linesData ?? []) as any[]).map((r) => String(r.id))

  // 2) Stock: DELETE vía RPC SECURITY DEFINER (evita PostgREST con caché de esquema
  //    desfasada tras ADD COLUMN, y RLS DELETE restrictivo en stock_movements).
  const { data: rpcDel, error: rpcErr } = await gate.supabase.rpc('delete_stock_movements_for_purchase_invoice', {
    p_invoice_id: invoiceId,
  })
  if (rpcErr) {
    const msg = String(rpcErr.message ?? '')
    if (/could not find the function|PGRST202|function .* does not exist/i.test(msg)) {
      return {
        success: false,
        message: `Error borrando stock: falta la función en BD. Ejecuta supabase/migrations/20260517140000_delete_albaran_stock_movements_rpc.sql o supabase db push. (${msg})`,
      }
    }
    return { success: false, message: `Error borrando stock: ${msg}` }
  }
  const deletedMovements = Number(rpcDel ?? 0) || 0

  // 3) Borrar el fichero del Storage (si existe). Si falla, lo registramos y
  //    seguimos: no queremos bloquear el delete por un archivo ya inexistente.
  if (filePath) {
    const { error: storageErr } = await gate.supabase.storage.from('albaranes').remove([filePath])
    if (storageErr) {
      console.warn('deletePurchaseInvoiceAction: storage remove warning', storageErr.message)
    }
  }

  // 4) Borrar cabecera. Las líneas caen por ON DELETE CASCADE.
  const { error: delInvErr } = await gate.supabase.from('purchase_invoices').delete().eq('id', invoiceId)
  if (delInvErr) return { success: false, message: `Error borrando albarán: ${delInvErr.message}` }

  try {
    revalidatePath('/dashboard/albaranes')
  } catch {}

  return { success: true, deletedMovements, deletedLines: lineIds.length }
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-mapeo masivo de líneas "aprendidas"
//
// Recorre las líneas todavía pendientes y, si existe una fila exacta en
// `supplier_item_mappings` para (supplier_id de la cabecera, original_name de
// la línea), las marca como `mapped` con el `ingredient_id` aprendido.
// El trigger de BD `handle_invoice_line_mapped_stock` se ocupa después del
// movimiento PURCHASE en `stock_movements` (con su propio idempotencia).
//
// No se auto-confirman matches por alias/similitud: esos siguen requiriendo
// validación humana desde el modal de mapeo.
// ─────────────────────────────────────────────────────────────────────────────

export type AutoMapReport = {
  invoicesScanned: number
  linesScanned: number
  autoMapped: number
  skippedNoSupplier: number
  skippedNoMatch: number
  errors: number
}

export async function autoMapKnownLinesAction(params?: {
  invoiceId?: string | null
}): Promise<{ success: true; report: AutoMapReport } | { success: false; message: string }> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: gate.message }

  const onlyInvoiceId = String(params?.invoiceId ?? '').trim() || null

  // 1) Cabeceras candidatas: tienen `supplier_id` y al menos una línea pendiente.
  //    Si recibimos un invoiceId concreto, restringimos a ese.
  let invoicesQ = gate.supabase
    .from('purchase_invoices')
    .select('id, supplier_id')
    .not('supplier_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(2000)
  if (onlyInvoiceId) invoicesQ = invoicesQ.eq('id', onlyInvoiceId)

  const { data: invoices, error: invErr } = await invoicesQ
  if (invErr) return { success: false, message: invErr.message }

  const invoiceList = (invoices ?? []) as Array<{ id: string; supplier_id: number | null }>
  const invoiceIds = invoiceList.map((r) => r.id)
  if (invoiceIds.length === 0) {
    return {
      success: true,
      report: { invoicesScanned: 0, linesScanned: 0, autoMapped: 0, skippedNoSupplier: 0, skippedNoMatch: 0, errors: 0 },
    }
  }

  // 2) Líneas pendientes de esos albaranes.
  const { data: pendingLines, error: linesErr } = await gate.supabase
    .from('purchase_invoice_lines')
    .select('id, invoice_id, original_name, status, mapped_ingredient_id')
    .in('invoice_id', invoiceIds)
    .is('mapped_ingredient_id', null)
    .neq('status', INVOICE_LINE_STATUS_EXCLUDED)
    .neq('status', INVOICE_LINE_STATUS_EXPENSE_ONLY)
    .limit(20000)
  if (linesErr) return { success: false, message: linesErr.message }

  const lines = (pendingLines ?? []) as Array<{
    id: string
    invoice_id: string
    original_name: string | null
    status: string | null
    mapped_ingredient_id: string | null
  }>

  const report: AutoMapReport = {
    invoicesScanned: invoiceList.length,
    linesScanned: lines.length,
    autoMapped: 0,
    skippedNoSupplier: 0,
    skippedNoMatch: 0,
    errors: 0,
  }
  if (lines.length === 0) return { success: true, report }

  const { data: result, error: rpcErr } = await gate.supabase.rpc('auto_map_invoice_lines_fuzzy', {
    p_invoice_id: onlyInvoiceId ?? null,
    p_similarity_threshold: 0.75,
  })
  if (rpcErr) return { success: false, message: rpcErr.message }

  const rpcResult = result as { mapped?: number; skipped?: number } | null
  const mapped = rpcResult?.mapped ?? 0
  const skipped = rpcResult?.skipped ?? 0

  if (onlyInvoiceId) {
    await syncPurchaseInvoiceStatusRpc(gate.supabase, onlyInvoiceId)
  } else {
    for (const inv of invoiceList) {
      await syncPurchaseInvoiceStatusRpc(gate.supabase, inv.id)
    }
  }

  try {
    revalidatePath('/dashboard/albaranes')
  } catch {}

  return {
    success: true,
    report: {
      invoicesScanned: invoiceList.length,
      linesScanned: lines.length,
      autoMapped: mapped,
      skippedNoSupplier: report.skippedNoSupplier,
      skippedNoMatch: skipped,
      errors: 0,
    },
  }
}

