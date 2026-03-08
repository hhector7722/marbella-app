'use server'
import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function confirmarMapeoAction(formData: FormData) {
  const supabase = await createClient()
  
  const lineId = formData.get('lineId') as string
  const supplierId = formData.get('supplierId') as string
  const originalName = formData.get('originalName') as string
  const ingredientId = formData.get('ingredientId') as string
  const conversionFactor = parseFloat(formData.get('conversionFactor') as string || '1')

  // 1. Crear el mapeo permanente para el futuro
  const { error: mapError } = await supabase
    .from('supplier_item_mappings')
    .upsert({
      supplier_id: parseInt(supplierId),
      supplier_item_name: originalName,
      ingredient_id: ingredientId,
      conversion_factor: conversionFactor
    }, { onConflict: 'supplier_id,supplier_item_name' })

  if (mapError) throw new Error(mapError.message)

  // 2. Marcar la línea actual como mapeada
  // El trigger de SQL que creamos antes se encargará de actualizar current_price automáticamente
  const { error: lineError } = await supabase
    .from('purchase_invoice_lines')
    .update({ mapped_ingredient_id: ingredientId, status: 'mapped' })
    .eq('id', lineId)

  if (lineError) throw new Error(lineError.message)

  revalidatePath('/dashboard')
}