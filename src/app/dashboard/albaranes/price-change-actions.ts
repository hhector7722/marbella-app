'use server'

import { createClient } from '@/utils/supabase/server'
import {
  isImportantPriceChange, priceChangeRatio, readIngredientReclassification
} from '@/lib/albaranes/price-change-alerts'

export type AlbaranPriceChange = {
  lineId: string
  description: string
  priceBefore: number
  priceAfter: number
  changePercent: number
  unit: string
}

/** Only the account receiving these alerts can load their precise comparisons. */
export async function getAlbaranPriceChangesAction(invoiceId: string): Promise<
  { success: true; changes: AlbaranPriceChange[] } | { success: false; message: string }
> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invoiceId)) {
    return { success: false, message: 'Albarán no válido.' }
  }

  const supabase = await createClient()
  // The signed session identifies the recipient; receipt rows remain protected by manager RLS.
  const { data: { session }, error: authError } = await supabase.auth.getSession()
  if (authError || session?.user?.email?.trim().toLowerCase() !== 'hhector7722@gmail.com') {
    return { success: false, message: 'Este aviso está reservado al titular de la cuenta.' }
  }

  const { data, error } = await supabase.from('purchase_receipt_confirmations')
    .select('purchase_invoice_line_id,price_before,price_after,price_locked,purchase_unit')
    .eq('purchase_invoice_id', invoiceId)
  if (error) return { success: false, message: 'No se han podido consultar los precios del albarán.' }

  const { data: corrections, error: correctionError } = await supabase.from('stock_movements')
    .select('provenance')
    .eq('movement_type','ADJUSTMENT')
    .contains('provenance',{
      schema_version:'albaran-reclassification-v1', kind:'correction_credit', invoice_id:invoiceId
    })
  if (correctionError) return { success:false, message:'No se pudieron consultar las rectificaciones del albarán.' }
  const reclassifications = (corrections ?? []).map((row) =>
    readIngredientReclassification(row.provenance)).filter((row) => row !== null)
  const correctedByLine = new Map(reclassifications.map((correction) => [correction.lineId, correction]))
  const invalidatedPriceLines = new Set(reclassifications
    .map((correction) => correction.invalidatedPriceLineId).filter(Boolean))

  const important = (data ?? []).flatMap((row) => {
    if (invalidatedPriceLines.has(row.purchase_invoice_line_id)) return []
    const correction = correctedByLine.get(row.purchase_invoice_line_id)
    const before = correction ? correction.priceBefore : row.price_before == null ? null : Number(row.price_before)
    const after = correction ? correction.priceAfter : row.price_after == null ? null : Number(row.price_after)
    if (!isImportantPriceChange(before, after, row.price_locked === true)) return []
    const delta = priceChangeRatio(before, after)
    if (delta == null) return []
    return [{
      lineId: String(row.purchase_invoice_line_id),
      priceBefore: before!,
      priceAfter: after!,
      changePercent: delta * 100,
      unit: String(row.purchase_unit ?? 'ud'),
    }]
  })
  if (!important.length) return { success: true, changes: [] }

  const { data: lines, error: linesError } = await supabase.from('purchase_invoice_lines')
    .select('id,original_name')
    .eq('invoice_id',invoiceId)
    .in('id',important.map((row) => row.lineId))
  if (linesError) return { success: false, message: 'No se han podido cargar los artículos afectados.' }
  const names = new Map((lines ?? []).map((row) => [row.id, row.original_name ?? 'Artículo']))

  return { success: true, changes: important.map((change) => ({
    ...change, description: correctedByLine.get(change.lineId)?.effectiveIngredientName ?? names.get(change.lineId) ?? 'Artículo',
  })) }
}
