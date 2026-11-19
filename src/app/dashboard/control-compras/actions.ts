'use server'

import { createClient } from '@/utils/supabase/server'
import { verifiedReceiptPriceVariations, type ReceiptPriceRow } from '@/lib/purchasing/verified-receipt-price-variations'

export type PurchaseObservation = {
  id: string; invoiceId: string; date: string; supplierId: number | null; supplier: string
  ingredientId: string; ingredient: string; category: string; unit: string
  quantity: number; unitPrice: number; amount: number
}
export type PurchasePriceEvent = {
  id: string; ingredientId: string; ingredient: string; category: string; unit: string
  date: string; oldPrice: number; newPrice: number; variation: number; source: string
  supplierId: number | null; supplier: string; invoiceId: string | null
}
export type PurchaseReview = {
  id: string; invoiceId: string; invoiceNumber: string | null; date: string
  supplierId: number | null; supplier: string; name: string; ingredientId: string | null
  category: string | null; status: string; reason: string; quantity: number | null
  unit: string | null; unitPrice: number | null
}
export type PurchaseDuplicateSignal = {
  id: string; invoiceId: string; date: string; name: string; ingredientId: string | null
  category: string | null; supplierId: number | null; supplier: string
}
export type ControlComprasData = {
  refreshedAt: string; periodDays: number; observations: PurchaseObservation[]
  priceEvents: PurchasePriceEvent[]; reviews: PurchaseReview[]; duplicates: PurchaseDuplicateSignal[]
  suppliers: { id: number; name: string }[]; categories: string[]; activeInvoices: number
}
type Result = { success: true; data: ControlComprasData } | { success: false; message: string }
// Supabase tiene un esquema de compras aún sin tipos generados en este repositorio.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>
const PERIODS = new Set([7, 30, 90, 365])
const num = (v: unknown): number | null => v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v)
const date = (v: unknown): string => String(v ?? '').slice(0, 10)
const reviewReason = (reasons: unknown): string => {
  const labels: Record<string, string> = {
    cantidad_precio_importe_no_reconcilian: 'Cantidad, precio e importe no concilian',
    ingredient_missing: 'Ingrediente sin identificar',
    unit_missing: 'Unidad pendiente',
    price_missing: 'Precio pendiente',
  }
  return Array.isArray(reasons) && reasons.length > 0
    ? [...new Set(reasons.map(String))].slice(0, 2).map(s => labels[s] ?? s.replaceAll('_', ' ')).join(' · ')
    : 'Recepción pendiente de revisión'
}

export async function getControlComprasDataAction(requestedDays = 90): Promise<Result> {
  const days = PERIODS.has(requestedDays) ? requestedDays : 90
  try {
    const supabase = await createClient()
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !session?.user?.id) return { success: false, message: 'Sesión no válida.' }
    const { data: profile, error: roleError } = await supabase.from('profiles').select('role')
      .eq('id', session.user.id).maybeSingle()
    if (roleError || !['manager', 'admin'].includes(String(profile?.role ?? ''))) {
      return { success: false, message: 'Solo gerencia puede consultar los costes de compra.' }
    }

    const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
    const [iv, ig, sp, pl] = await Promise.all([
      supabase.from('purchase_invoices')
        .select('id,invoice_date,invoice_number,supplier_id,status,duplicate_of_invoice_id,operational_hidden_at')
        .neq('status', 'discarded').is('operational_hidden_at', null).limit(500),
      supabase.from('ingredients').select('id,name,category,purchase_unit').limit(500),
      supabase.from('suppliers').select('id,name').limit(500),
      supabase.from('purchase_invoice_lines')
        .select('id,invoice_id,original_name,quantity,unit_price,line_unit,mapped_ingredient_id,status,interpretation_proposal_id')
        .eq('status', 'pending').is('superseded_by_extraction_id', null).limit(700),
    ])
    const basicError = iv.error ?? ig.error ?? sp.error ?? pl.error
    if (basicError) return { success: false, message: basicError.message }
    const invoices: Row[] = (iv.data ?? []).filter((r: Row) => !r.duplicate_of_invoice_id)
    const invoiceMap = new Map<string, Row>(invoices.map((r: Row) => [r.id, r]))
    const recent = invoices.filter(r => r.invoice_date && r.invoice_date >= since)
    const recentIds = recent.map(r => String(r.id))
    const ingredientMap = new Map<string, Row>((ig.data ?? []).map((r: Row) => [r.id, r]))
    const suppliers = (sp.data ?? []).map((r: Row) => ({ id: Number(r.id), name: String(r.name) }))
    const supplierMap = new Map<number, string>(suppliers.map(r => [r.id, r.name]))
    const supplier = (id: number | null): string => id == null ? 'Sin proveedor' : supplierMap.get(id) ?? 'Sin proveedor'

    const [rc, pr] = await Promise.all([
      recentIds.length ? supabase.from('purchase_receipt_confirmations')
        .select('id,purchase_invoice_line_id,purchase_invoice_id,ingredient_id,purchase_quantity,normalized_unit_price')
        .in('purchase_invoice_id', recentIds).limit(1000) : Promise.resolve({ data: [] as Row[], error: null }),
      recentIds.length ? supabase.from('purchase_interpretation_proposals')
        .select('id,status,review_reasons').in('purchase_invoice_id', recentIds)
        .in('status', ['needs_mapping', 'needs_review']).limit(1000)
        : Promise.resolve({ data: [] as Row[], error: null }),
    ])
    if (rc.error || pr.error) return { success: false, message: rc.error?.message ?? pr.error?.message ?? 'Error de datos.' }
    const confirmed = new Set((rc.data ?? []).map((r: Row) => String(r.purchase_invoice_line_id)))
    const proposals = new Map<string, Row>((pr.data ?? []).map((r: Row) => [r.id, r]))
    const observations: PurchaseObservation[] = (rc.data ?? []).flatMap((r: Row) => {
      const invoice = invoiceMap.get(String(r.purchase_invoice_id))
      const ingredient = ingredientMap.get(String(r.ingredient_id))
      const quantity = num(r.purchase_quantity), unitPrice = num(r.normalized_unit_price)
      if (!invoice || !ingredient || quantity === null || unitPrice === null || quantity < 0 || unitPrice < 0) return []
      return [{
        id: String(r.id), invoiceId: String(invoice.id), date: String(invoice.invoice_date),
        supplierId: num(invoice.supplier_id), supplier: supplier(num(invoice.supplier_id)),
        ingredientId: String(ingredient.id), ingredient: String(ingredient.name),
        category: String(ingredient.category), unit: String(ingredient.purchase_unit),
        quantity, unitPrice, amount: quantity * unitPrice,
      }]
    })

    // Paginación explícita: no depender del límite de 1.000 filas de PostgREST.
    const lineRows: Row[] = []
    if (recentIds.length) {
      for (let offset = 0; offset < 6000; offset += 500) {
        const { data, error } = await supabase.from('purchase_invoice_lines')
          .select('id,invoice_id,original_name,quantity,unit_price,line_unit,mapped_ingredient_id,status,interpretation_proposal_id')
          .in('invoice_id', recentIds).is('superseded_by_extraction_id', null)
          .order('id').range(offset, offset + 499)
        if (error) return { success: false, message: error.message }
        lineRows.push(...(data ?? []))
        if ((data ?? []).length < 500) break
        if (offset >= 5500) return { success: false, message: 'El periodo supera el límite seguro de líneas.' }
      }
    }

    // Coincidencias exactas dentro de un mismo albarán: son sospechas, no anulaciones.
    const signatureGroups = new Map<string, Row[]>()
    for (const r of lineRows) {
      if (r.status === 'excluded' || r.status === 'expense_only') continue
      if (num(r.quantity) === null || num(r.unit_price) === null || !r.original_name?.trim()) continue
      const signature = [r.invoice_id, String(r.original_name).trim().toLowerCase(),
        Number(r.quantity).toFixed(3), Number(r.unit_price).toFixed(4)].join('|')
      signatureGroups.set(signature, [...(signatureGroups.get(signature) ?? []), r])
    }
    const duplicates: PurchaseDuplicateSignal[] = [...signatureGroups.values()].filter(group => group.length > 1).flatMap(group => {
      const r = group[0]
      const invoice = invoiceMap.get(String(r.invoice_id))
      if (!invoice) return []
      const ingredient = ingredientMap.get(String(r.mapped_ingredient_id))
      return [{ id: String(r.id), invoiceId: String(invoice.id), date: date(invoice.invoice_date),
        name: String(r.original_name), ingredientId: ingredient?.id ?? null,
        category: ingredient?.category ?? null, supplierId: num(invoice.supplier_id),
        supplier: supplier(num(invoice.supplier_id)) }]
    })

    const candidates = new Map<string, Row>()
    for (const r of pl.data ?? []) if (invoiceMap.has(String(r.invoice_id))) candidates.set(r.id, r)
    for (const r of lineRows) {
      if (r.status === 'pending' || (r.status === 'mapped' && !confirmed.has(r.id) && proposals.has(r.interpretation_proposal_id))) {
        candidates.set(r.id, r)
      }
    }
    const reviews: PurchaseReview[] = [...candidates.values()].flatMap(r => {
      const invoice = invoiceMap.get(String(r.invoice_id))
      if (!invoice || confirmed.has(r.id)) return []
      const ingredient = ingredientMap.get(String(r.mapped_ingredient_id))
      const proposal = proposals.get(String(r.interpretation_proposal_id))
      return [{
        id: String(r.id), invoiceId: String(invoice.id), invoiceNumber: invoice.invoice_number ?? null,
        date: date(invoice.invoice_date), supplierId: num(invoice.supplier_id),
        supplier: supplier(num(invoice.supplier_id)), name: String(r.original_name),
        ingredientId: ingredient?.id ?? null, category: ingredient?.category ?? null,
        status: String(r.status), reason: proposal ? reviewReason(proposal.review_reasons)
          : r.mapped_ingredient_id ? 'Recepción pendiente de confirmar' : 'Ingrediente o presentación sin confirmar',
        quantity: num(r.quantity), unit: r.line_unit ?? null, unitPrice: num(r.unit_price),
      }]
    }).sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name))

    // Comparar SOLO recepciones confirmadas entre sí. Una corrección manual
    // reinicia la referencia para evitar alertas derivadas de un precio erróneo.
    // Leemos también eventos anteriores al periodo para encontrar la referencia.
    const events: ReceiptPriceRow[] = []
    for (let offset = 0; offset < 3000; offset += 500) {
      const { data, error } = await supabase.from('ingredient_price_history')
        .select('id,ingredient_id,new_price,changed_at,source,purchase_invoice_id')
        .in('source', ['receipt_confirmation', 'manual'])
        .order('changed_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + 499)
      if (error) return { success: false, message: error.message }
      events.push(...((data ?? []) as ReceiptPriceRow[]))
      if ((data ?? []).length < 500) break
      if (offset >= 2500) return { success: false, message: 'Histórico de recepciones demasiado extenso.' }
    }
    const priceEvents: PurchasePriceEvent[] = verifiedReceiptPriceVariations(events, since)
      .flatMap(({ receipt, previousPrice, currentPrice, variation }) => {
        const ingredient = ingredientMap.get(String(receipt.ingredient_id))
        if (!ingredient) return []
        const invoiceId = String(receipt.purchase_invoice_id)
        const invoice = invoiceMap.get(invoiceId)
        return [{
          id: String(receipt.id), ingredientId: String(ingredient.id),
          ingredient: String(ingredient.name), category: String(ingredient.category),
          unit: String(ingredient.purchase_unit), date: date(receipt.changed_at),
          oldPrice: previousPrice, newPrice: currentPrice, variation,
          source: 'receipt_confirmation', invoiceId,
          supplierId: invoice ? num(invoice.supplier_id) : null,
          supplier: invoice ? supplier(num(invoice.supplier_id)) : 'Proveedor sin identificar',
        }]
      })
    return { success: true, data: {
      refreshedAt: new Date().toISOString(), periodDays: days, observations,
      priceEvents, reviews, duplicates, suppliers,
      categories: [...new Set([...ingredientMap.values()].map(r => String(r.category)))].sort(),
      activeInvoices: recent.length,
    } }
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : 'No se pudo cargar Control compras.' }
  }
}
