#!/usr/bin/env node
// Reevalúa solo lecturas comprobadas en albaranes pendientes. Por defecto
// informa; --apply versiona K5 y actualiza la línea operativa, nunca invoca K4.
import { createHash, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { canonicalLineSchema } from '../../src/lib/albaranes/extractors/canonical.ts'
import { validateObservedLine, parseObservedDecimal } from '../../src/lib/albaranes/pipeline/validate.ts'

const TARGETS = {
  videla: 'beed288e-2df8-4ebb-afc2-0100f7d2cb6a', // 2026-10-02
  santaTeresa: '08c83aae-8e59-4775-9047-860cd74c820d', // 2026-09-23
  panabad: '09840ee6-5f43-4d82-a0c5-5cfd66fbe6f2', // 2026-10-02
  shers: '33e3e7f4-ca09-4067-a249-e6b37e920fce', // 2026-10-01
}
const TARGET_IDS = Object.values(TARGETS)
const apply = process.argv.includes('--apply')
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Faltan credenciales de servicio Supabase')
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

function same(left, right) {
  const a = typeof left === 'number' ? left : parseObservedDecimal(String(left ?? ''))
  const b = typeof right === 'number' ? right : parseObservedDecimal(String(right ?? ''))
  return a != null && b != null && Math.abs(a - b) < 0.000001
}

const { data: invoices, error: invoiceError } = await db.from('purchase_invoices')
  .select('id,status,duplicate_of_invoice_id').in('id', TARGET_IDS)
if (invoiceError || invoices?.length !== TARGET_IDS.length) throw new Error('No se pudieron verificar los albaranes')
const eligibleInvoices = new Set(invoices.filter((invoice) =>
  !['received', 'discarded'].includes(invoice.status) && !invoice.duplicate_of_invoice_id)
  .map((invoice) => invoice.id))
const { data: lines, error: lineError } = await db.from('purchase_invoice_lines')
  .select('id,invoice_id,interpretation_proposal_id,original_name,quantity,line_unit,unit_price,total_price,status,mapped_ingredient_id,superseded_by_extraction_id')
  .in('invoice_id', TARGET_IDS).is('superseded_by_extraction_id', null)
if (lineError) throw new Error(`No se pudieron leer las líneas: ${lineError.message}`)
const proposalIds = (lines ?? []).map((line) => line.interpretation_proposal_id).filter(Boolean)
const lineIds = (lines ?? []).map((line) => line.id)
const [proposalResult, confirmationResult] = await Promise.all([
  db.from('purchase_interpretation_proposals').select('*').in('id', proposalIds),
  db.from('purchase_receipt_confirmations').select('purchase_invoice_line_id').in('purchase_invoice_line_id', lineIds),
])
if (proposalResult.error || confirmationResult.error) throw new Error('No se pudo comprobar K5 y K4')
const proposals = new Map((proposalResult.data ?? []).map((row) => [row.id, row]))
const received = new Set((confirmationResult.data ?? []).map((row) => row.purchase_invoice_line_id))
const planned = []
for (const line of lines ?? []) {
  if (!eligibleInvoices.has(line.invoice_id) || received.has(line.id) || !['pending', 'mapped'].includes(line.status)) continue
  const prior = proposals.get(line.interpretation_proposal_id)
  if (!prior || prior.normalizer_version !== 'mistral-pipeline-v3'
    || !prior.review_reasons?.includes('cantidad_precio_importe_no_reconcilian')) continue
  const parsed = canonicalLineSchema.safeParse(prior.observed)
  if (!parsed.success) continue
  const observed = parsed.data
  const checked = validateObservedLine(observed)
  if (checked.reasons.includes('cantidad_precio_importe_no_reconcilian')
    || checked.quantity == null || checked.unitPrice == null || checked.lineTotal == null) continue

  let kind = null
  if (line.invoice_id === TARGETS.videla
    && /^\s*(?:BU|BULTOS?|CJ|CAJAS?)\s+\d+(?:[.,]\d+)?\s*(?:KG|KILOS?|QUILOS?)\s*$/i.test(observed.billing_unit_raw ?? '')
    && checked.quantity === 1 && checked.priceBasis === 'package_content'
    && checked.packageContent != null && line.line_unit?.toLowerCase() === 'kg'
    && same(line.quantity, checked.packageContent)
    && same(line.unit_price, checked.unitPrice) && same(line.total_price, checked.lineTotal)
    && prior.ingredient_id === line.mapped_ingredient_id && prior.mapping_version_id) {
    const { data: mapping, error } = await db.from('purchase_mapping_versions')
      .select('id,status,ingredient_id,line_billing_unit,line_content_qty,line_content_unit,conversion_factor')
      .eq('id', prior.mapping_version_id).maybeSingle()
    if (error) throw new Error('No se pudo verificar la presentación de Videla')
    if (mapping?.status === 'confirmed' && mapping.ingredient_id === prior.ingredient_id
      && mapping.line_billing_unit === 'kg' && mapping.line_content_unit === 'kg'
      && same(mapping.line_content_qty, 1) && same(mapping.conversion_factor, 1)) kind = 'un_bulto_kg'
  }
  if (line.invoice_id === TARGETS.santaTeresa && checked.priceBasis === 'billing_quantity'
    && observed.other_charge_header_raw?.trim().toLocaleLowerCase('es') === 'importe'
    && observed.discount_header_raw?.trim().toLocaleLowerCase('es') === 'ibee'
    && same(checked.lineTotal, observed.other_charge_raw)
    && !same(checked.lineTotal, observed.line_total_raw)
    && same(line.quantity, checked.quantity) && same(line.unit_price, checked.unitPrice)
    && same(line.total_price, observed.line_total_raw)) kind = 'importe_vs_pre_iva'
  if (line.invoice_id === TARGETS.panabad && checked.priceBasis === 'billing_quantity'
    && checked.discountPercent != null && !observed.discount_header_raw?.trim()
    && prior.review_reasons?.includes('descuento_sin_porcentaje_verificado')
    && prior.review_reasons?.includes('cantidad_precio_importe_no_reconcilian')
    && same(line.quantity, checked.quantity) && same(line.unit_price, checked.unitPrice)
    && same(line.total_price, checked.lineTotal)) kind = 'descuento_porcentual_por_ecuacion'
  if (line.invoice_id === TARGETS.shers && checked.priceBasis === 'billing_quantity'
    && /^\s*dto\.?\s*$/i.test(observed.discount_header_raw ?? '')
    && observed.net_unit_price_raw && checked.netUnitPrice != null
    && checked.discountPercent == null && prior.review_reasons?.includes('descuento_sin_porcentaje_verificado')
    && same(line.quantity, checked.quantity) && same(line.unit_price, checked.unitPrice)
    && same(line.total_price, checked.lineTotal)) kind = 'descuento_euros_con_precio_neto'
  if (!kind) continue

  const reasons = prior.review_reasons.filter((reason) =>
    !(['cantidad_precio_importe_no_reconcilian', 'descuento_sin_porcentaje_verificado', 'precio_neto_contradictorio'].includes(reason)
      && !checked.reasons.includes(reason)))
  const status = reasons.length === 0 && prior.ingredient_id && prior.mapping_version_id
    && prior.normalized && Object.keys(prior.normalized).length > 0
    ? 'ready_for_review' : 'needs_review'
  planned.push({ line, prior, kind, checked, reasons, status })
}

console.log(JSON.stringify({ mode: apply ? 'apply' : 'plan', eligible: planned.length,
  kinds: { un_bulto_kg: planned.filter((entry) => entry.kind === 'un_bulto_kg').length,
    importe_vs_pre_iva: planned.filter((entry) => entry.kind === 'importe_vs_pre_iva').length,
    descuento_porcentual_por_ecuacion: planned.filter((entry) => entry.kind === 'descuento_porcentual_por_ecuacion').length,
    descuento_euros_con_precio_neto: planned.filter((entry) => entry.kind === 'descuento_euros_con_precio_neto').length },
  lines: planned.map(({ line, prior, kind, checked, reasons, status }) => ({
    id: line.id, invoice_id: line.invoice_id, name: line.original_name, kind,
    proposal_before: prior.id, total_before: line.total_price, total_after: checked.lineTotal,
    reasons_before: prior.review_reasons, reasons_after: reasons, status_after: status,
  })) }, null, 2))

if (apply) {
  for (const { line, prior, kind, checked, reasons, status } of planned) {
    const { data: confirmed, error: confirmationError } = await db.from('purchase_receipt_confirmations')
      .select('id').eq('purchase_invoice_line_id', line.id).limit(1)
    if (confirmationError || confirmed?.length) throw new Error(`La línea ${line.id} ya no es elegible`)
    const { data: successors, error: successorError } = await db.from('purchase_interpretation_proposals')
      .select('id').eq('supersedes_proposal_id', prior.id).limit(1)
    if (successorError || successors?.length) throw new Error(`La propuesta ${prior.id} ya tiene sucesora`)
    const copy = { ...prior }
    delete copy.id
    delete copy.created_at
    const fingerprint = createHash('sha256').update(JSON.stringify([
      'verified-pending-math-v1', prior.id, kind, checked.lineTotal, reasons,
    ])).digest('hex')
    const { data: successor, error: insertError } = await db.from('purchase_interpretation_proposals')
      .insert({ ...copy, proposal_set_id: randomUUID(), input_fingerprint: fingerprint,
        supersedes_proposal_id: prior.id, status, review_reasons: reasons,
        line_total: checked.lineTotal,
        interpreted: { ...prior.interpreted, reasons, verified_column_revision: kind },
        pricing: { ...prior.pricing, effective_line_total: checked.lineTotal },
        provenance: { ...prior.provenance, revision: 'verified_document_economics',
          reassessment: kind, economic_effects: false },
      }).select('id').single()
    if (insertError || !successor) throw new Error(`No se pudo versionar ${line.id}: ${insertError?.message}`)
    const { data: updated, error: updateError } = await db.from('purchase_invoice_lines')
      .update({ interpretation_proposal_id: successor.id, total_price: checked.lineTotal,
        status: status === 'ready_for_review' ? 'mapped' : line.status })
      .eq('id', line.id).eq('interpretation_proposal_id', prior.id)
      .select('id').maybeSingle()
    if (updateError || !updated) throw new Error(`Propuesta ${successor.id} creada; la línea ${line.id} requiere conciliación manual`)
    console.log(`Reevaluada ${line.id}: ${kind}; propuesta ${successor.id}`)
  }
}
