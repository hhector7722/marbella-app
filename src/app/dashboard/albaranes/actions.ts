'use server'

// SSOT precios ingredientes / albaranes: marbella-os/3-ingenieria/dominio/PRECIOS-Y-COMPRAS.md
import { suggestedAlbaranConversionFactorFromIngredient } from '@/lib/ingredient-pack-pricing'
import { buildIngredientPriceOnlyPatch } from '@/lib/ingredient-price-sync'
import { convertToPurchaseUnitQuantity } from '@/lib/recipe-cost'
import {
  INVOICE_LINE_STATUS_EXCLUDED,
  INVOICE_LINE_STATUS_EXPENSE_ONLY,
  invoiceLineRequiresStock,
  isInvoiceLineResolved,
} from '@/lib/albaranes-line-status'
import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { PURCHASE_INVOICES_INITIAL_LIMIT } from '@/lib/albaranes/purchase-invoices-list'
import { deriveVariableWeightEvidence } from '@/lib/albaranes/k5/variable-weight'

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

function isMissingReferenceDocColumnError(message: string): boolean {
  const m = String(message ?? '')
  return /reference_doc/i.test(m) && /does not exist|schema cache|PGRST204|could not find/i.test(m)
}

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

export type PurchaseInvoiceListItem = {
  id: string
  created_at: string
  created_by: string | null
  source: string | null
  status: string | null
  ocr_error: string | null
  supplier_id: number | null
  supplier_name: string | null
  supplier_image_url: string | null
  invoice_number: string | null
  invoice_date: string | null
  total_amount: number | null
  file_path: string | null
  is_fully_processed: boolean
}

const PURCHASE_INVOICE_LIST_SELECT = `
      id,
      created_at,
      created_by,
      source,
      status,
      ocr_error,
      supplier_id,
      invoice_number,
      invoice_date,
      total_amount,
      file_path,
      suppliers(name,image_url)
    `

function mapPurchaseInvoiceRows(data: unknown[]): PurchaseInvoiceListItem[] {
  return (data ?? []).map((r: any) => ({
    id: r.id,
    created_at: r.created_at,
    created_by: r.created_by ?? null,
    source: r.source ?? null,
    status: r.status ?? null,
    ocr_error: r.ocr_error ?? null,
    supplier_id: r.supplier_id ?? null,
    supplier_name: r.suppliers?.name ?? null,
    supplier_image_url: r.suppliers?.image_url ?? null,
    invoice_number: r.invoice_number ?? null,
    invoice_date: r.invoice_date ?? null,
    total_amount: r.total_amount ?? null,
    file_path: r.file_path ?? null,
    // El tick de stock se resuelve al abrir el detalle, no en el listado:
    // cruzar 200 albaranes con stock_movements colgaba el SSR y pintaba lista vacía.
    is_fully_processed: false,
  }))
}

type QueryPurchaseInvoicesListParams = {
  limit: number
  offset?: number
  dateFrom?: string | null
  dateTo?: string | null
  supplierId?: number | null
}

/**
 * Paginación por offset (`.range`): keyset compuesto con `invoice_date` nullable
 * no es práctico en PostgREST sin RPC dedicada; el histórico es append-mostly y
 * el orden es estable (invoice_date ↓, created_at ↓).
 */
async function queryPurchaseInvoicesList(
  gate: Extract<GateResult, { ok: true }>,
  params: QueryPurchaseInvoicesListParams
): Promise<{ items: PurchaseInvoiceListItem[]; hasMore: boolean; canViewAll: boolean }> {
  const limit = Math.min(Math.max(Number(params.limit) || 1, 1), 200)
  const offset = Math.max(Number(params.offset ?? 0) || 0, 0)
  const fetchCount = limit + 1
  const canViewAll = gate.role === 'manager' || gate.role === 'admin' || gate.role === 'supervisor'

  let q = gate.supabase
    .from('purchase_invoices')
    .select(PURCHASE_INVOICE_LIST_SELECT)
    .order('invoice_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  const dateFrom = String(params.dateFrom ?? '').trim()
  const dateTo = String(params.dateTo ?? '').trim()
  if (dateFrom) q = q.gte('invoice_date', dateFrom)
  if (dateTo) q = q.lte('invoice_date', dateTo)

  const supplierId = params.supplierId
  if (supplierId != null && Number.isFinite(supplierId)) {
    q = q.eq('supplier_id', supplierId)
  }

  q = q.range(offset, offset + fetchCount - 1)

  const { data, error } = await q
  if (error) throw error

  const rows = mapPurchaseInvoiceRows((data as unknown[]) ?? [])
  const hasMore = rows.length > limit
  const pageRows = hasMore ? rows.slice(0, limit) : rows

  return { items: pageRows, hasMore, canViewAll }
}

export async function listPurchaseInvoicesAction(params?: {
  limit?: number
  offset?: number
  dateFrom?: string | null
  dateTo?: string | null
  supplierId?: number | null
}): Promise<
  | { success: true; items: PurchaseInvoiceListItem[]; hasMore: boolean; canViewAll: boolean }
  | { success: false; message: string }
> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: 'No autorizado' }

  const limit = Math.min(Math.max(Number(params?.limit ?? PURCHASE_INVOICES_INITIAL_LIMIT) || PURCHASE_INVOICES_INITIAL_LIMIT, 1), 200)

  try {
    const { items, hasMore, canViewAll } = await queryPurchaseInvoicesList(gate, {
      limit,
      offset: params?.offset ?? 0,
      dateFrom: params?.dateFrom ?? null,
      dateTo: params?.dateTo ?? null,
      supplierId: params?.supplierId ?? null,
    })
    return { success: true, items, hasMore, canViewAll }
  } catch (e: unknown) {
    return { success: false, message: e instanceof Error ? e.message : 'Error listando albaranes' }
  }
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

/** Listado inicial del histórico: más recientes primero, sin tope de fechas. */
export async function listPurchaseInvoicesDefaultWeekAction(): Promise<
  | {
      success: true
      items: PurchaseInvoiceListItem[]
      hasMore: boolean
      canViewAll: boolean
    }
  | { success: false; message: string }
> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: 'No autorizado' }

  try {
    const cur = await queryPurchaseInvoicesList(gate, {
      limit: PURCHASE_INVOICES_INITIAL_LIMIT,
      offset: 0,
    })
    return {
      success: true,
      items: cur.items,
      hasMore: cur.hasMore,
      canViewAll: cur.canViewAll,
    }
  } catch (e: unknown) {
    return { success: false, message: e instanceof Error ? e.message : 'Error listando albaranes' }
  }
}

export async function listSuppliersForFilterAction(): Promise<{ success: true; suppliers: { id: number; name: string }[] } | { success: false; message: string }> {
  const gate = await gateAuthenticated()
  if (!gate.ok) return { success: false, message: 'No autorizado' }

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
  interpretation_proposal_id: string | null
  variable_weight_kg: number | null
  variable_piece_count: number | null
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
  ocr_error: string | null
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
  if (!gate.ok) return { success: false, message: 'No autorizado' }

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
      ocr_error,
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
        interpretation_proposal_id,
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
    interpretation_proposal_id: l.interpretation_proposal_id ?? null,
    variable_weight_kg: null as number | null,
    variable_piece_count: null as number | null,
  })) as PurchaseInvoiceLine[]

  const proposalIds = lines.map((line) => line.interpretation_proposal_id).filter((id): id is string => Boolean(id))
  if (proposalIds.length > 0) {
    const { data: proposalRows, error: proposalError } = await gate.supabase
      .from('purchase_interpretation_proposals')
      .select('id,observed,observed_unit_price,line_total')
      .in('id', proposalIds)
    if (proposalError) return { success: false, message: proposalError.message }

    const proposalById = new Map((proposalRows ?? []).map((row: any) => [String(row.id), row]))
    for (const line of lines) {
      if (!line.interpretation_proposal_id) continue
      const proposal = proposalById.get(line.interpretation_proposal_id)
      const rawCells = Array.isArray(proposal?.observed?.raw_cells) ? proposal.observed.raw_cells : []
      const variable = deriveVariableWeightEvidence({
        rawCells,
        unitPrice: proposal?.observed_unit_price ?? line.unit_price,
        lineTotal: proposal?.line_total ?? line.total_price,
      })
      if (!variable) continue
      line.variable_weight_kg = variable.weightKg
      line.variable_piece_count = variable.pieceCount
    }
  }

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
    ocr_error: (data as any).ocr_error ?? null,
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
  if (!gate.ok) return { success: false, message: 'No autorizado' }

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

  // K4: editar evidencia nunca modifica precios ni stock. La confirmación
  // económica solo pasa por apply_receipt_line tras una vista previa explícita.
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

  // 1) Movimientos aplicados: K4 usa una referencia tipada; el histórico
  // conserva `ALB-LINE-*` para que la lectura siga siendo compatible.
  const appliedRefs = lineIds.map((id) => `ALB-LINE-${id}`)
  const { data: appliedRows, error: appliedErr } = await gate.supabase
    .from('stock_movements')
    .select('reference_doc, reference_id, quantity')
    .eq('movement_type', 'PURCHASE')
    .or(`reference_doc.in.(${appliedRefs.map((ref) => `\"${ref}\"`).join(',')}),and(reference_type.eq.purchase_invoice_line,reference_id.in.(${lineIds.map((id) => `\"${id}\"`).join(',')}))`)
  if (appliedErr) return { success: false, message: appliedErr.message }

  const appliedMap = new Map<string, number>()
  for (const r of appliedRows ?? []) {
    const ref = String((r as any).reference_doc ?? '')
    const lineId = String((r as any).reference_id ?? '')
    const qty = Number((r as any).quantity)
    if (!Number.isFinite(qty)) continue
    if (lineId && lineIds.includes(lineId)) {
      appliedMap.set(`ALB-LINE-${lineId}`, qty)
    } else if (ref) {
      appliedMap.set(ref, qty)
    }
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
    .select('id, name, current_price, purchase_unit')
    .order('name')
    .limit(4000)
  if (ingErr) return { success: false, message: ingErr.message }
  const ingredients = (ingRows ?? []).map((r: any) => ({
    id: String(r.id),
    name: String(r.name ?? ''),
    current_price: Number(r.current_price) || 0,
    purchase_unit: r.purchase_unit ?? 'kg',
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
      const storedFactor = Number((exact as any).conversion_factor)
      const factor = Number.isFinite(storedFactor) && storedFactor > 0 ? storedFactor : 1
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
  const suggestedFactor = suggested ? 1 : null
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

