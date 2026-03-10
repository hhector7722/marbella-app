'use server'
import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function confirmarMapeoAction(formData: FormData) {
  const supabase = await createClient()

  const lineId = formData.get('lineId') as string
  const supplierIdRaw = formData.get('supplierId') as string | null
  const originalName = formData.get('originalName') as string
  const ingredientId = formData.get('ingredientId') as string
  const conversionFactor = parseFloat(formData.get('conversionFactor') as string || '1')

  const supplierIdParsed = supplierIdRaw != null && supplierIdRaw.trim() !== ''
    ? parseInt(supplierIdRaw, 10)
    : null
  if (supplierIdParsed != null && (isNaN(supplierIdParsed) || supplierIdParsed < 0)) {
    throw new Error('ID de proveedor inválido')
  }

  // 1. Crear/actualizar mapeo permanente
  const { error: mapError } = await supabase
    .from('supplier_item_mappings')
    .upsert({
      supplier_id: supplierIdParsed,
      supplier_item_name: originalName,
      ingredient_id: ingredientId,
      conversion_factor: conversionFactor
    }, { onConflict: 'supplier_id,supplier_item_name' })

  if (mapError) throw new Error(mapError.message)

  // 2. Precio desde el albarán: actualizar ingrediente e historial (el trigger solo corre en INSERT de líneas)
  const { data: line } = await supabase
    .from('purchase_invoice_lines')
    .select('unit_price')
    .eq('id', lineId)
    .single()

  const unitPrice = line?.unit_price ?? 0
  const factor = conversionFactor && !Number.isNaN(conversionFactor) ? conversionFactor : 1
  const newPrice = unitPrice / factor

  const { data: ing } = await supabase
    .from('ingredients')
    .select('current_price')
    .eq('id', ingredientId)
    .single()

  const oldPrice = ing?.current_price ?? 0

  await supabase.from('ingredient_price_history').insert({
    ingredient_id: ingredientId,
    old_price: oldPrice,
    new_price: newPrice
  })

  const { error: updIngError } = await supabase
    .from('ingredients')
    .update({ current_price: newPrice, updated_at: new Date().toISOString() })
    .eq('id', ingredientId)

  if (updIngError) throw new Error(updIngError.message)

  if (supplierIdParsed != null) {
    await supabase
      .from('supplier_item_mappings')
      .update({ last_known_price: unitPrice })
      .eq('supplier_id', supplierIdParsed)
      .eq('supplier_item_name', originalName)
  }

  // 3. Marcar línea como mapeada
  const { error: lineError } = await supabase
    .from('purchase_invoice_lines')
    .update({ mapped_ingredient_id: ingredientId, status: 'mapped' })
    .eq('id', lineId)

  if (lineError) throw new Error(lineError.message)

  revalidatePath('/dashboard')
}