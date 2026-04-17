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

  // 1. Obtener todos los datos necesarios en paralelo para la línea y el ingrediente
  const [lineRes, ingRes] = await Promise.all([
    supabase.from('purchase_invoice_lines').select('unit_price, quantity').eq('id', lineId).single(),
    supabase.from('ingredients').select('current_price, unit').eq('id', ingredientId).single()
  ])

  if (lineRes.error || !lineRes.data) throw new Error('Error obteniendo la línea del albarán')
  if (ingRes.error || !ingRes.data) throw new Error('Error obteniendo el ingrediente base')

  const unitPrice = lineRes.data.unit_price ?? 0
  const lineQuantity = lineRes.data.quantity ?? 0
  const oldPrice = ingRes.data.current_price ?? 0
  const ingredientUnit = ingRes.data.unit || 'ud'

  const factor = conversionFactor && !Number.isNaN(conversionFactor) ? conversionFactor : 1
  const newPrice = unitPrice / factor

  // 2. Crear/actualizar mapeo permanente
  const { error: mapError } = await supabase
    .from('supplier_item_mappings')
    .upsert({
      supplier_id: supplierIdParsed,
      supplier_item_name: originalName,
      ingredient_id: ingredientId,
      conversion_factor: conversionFactor
    }, { onConflict: 'supplier_id,supplier_item_name' })
  if (mapError) throw new Error(`Error en mapeo: ${mapError.message}`)

  // 3. Historial de Precios y Actualización de Ingrediente
  await supabase.from('ingredient_price_history').insert({
    ingredient_id: ingredientId,
    old_price: oldPrice,
    new_price: newPrice
  })

  const { error: updIngError } = await supabase
    .from('ingredients')
    .update({ current_price: newPrice, updated_at: new Date().toISOString() })
    .eq('id', ingredientId)
  if (updIngError) throw new Error(`Error actualizando precio base: ${updIngError.message}`)

  if (supplierIdParsed != null) {
    await supabase
      .from('supplier_item_mappings')
      .update({ last_known_price: unitPrice })
      .eq('supplier_id', supplierIdParsed)
      .eq('supplier_item_name', originalName)
  }

  // 4. INYECCIÓN EN EL LEDGER DE INVENTARIO (NUEVO)
  // Calculamos la cantidad exacta en la Unidad de Medida Base (UMB)
  const quantityToAdd = lineQuantity * conversionFactor

  if (quantityToAdd > 0) {
    const { error: ledgerError } = await supabase
      .from('stock_movements')
      .insert({
        movement_type: 'PURCHASE',
        ingredient_id: ingredientId,
        quantity: quantityToAdd,
        unit: ingredientUnit,
        reference_doc: `ALB-LINE-${lineId}`,
        original_description: `Recepción: ${originalName} (Factor: ${conversionFactor})`,
        processed_by: 'Consolidación UI'
      })
    if (ledgerError) throw new Error(`Error inyectando stock: ${ledgerError.message}`)
  }

  // 5. Marcar línea como mapeada (Cierre)
  const { error: lineError } = await supabase
    .from('purchase_invoice_lines')
    .update({ mapped_ingredient_id: ingredientId, status: 'mapped' })
    .eq('id', lineId)
  if (lineError) throw new Error(`Error cerrando línea: ${lineError.message}`)

  revalidatePath('/dashboard')
}