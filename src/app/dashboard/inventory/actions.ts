'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

interface CountPayload {
  ingredient_id: string
  physical_stock: number
  theoretical_stock: number
  unit: string
}

export async function processInventoryCounts(counts: CountPayload[]) {
  const supabase = await createClient()
  
  const actionableCounts = counts.filter(
    (c) => c.physical_stock !== c.theoretical_stock
  )

  if (actionableCounts.length === 0) {
    return { success: true, message: 'No hay descuadres que registrar.' }
  }

  const movements = actionableCounts.map((count) => {
    const delta = count.physical_stock - count.theoretical_stock

    return {
      movement_type: 'INVENTORY_COUNT',
      ingredient_id: count.ingredient_id,
      quantity: delta,
      unit: count.unit,
      reference_doc: `INV-${new Date().getTime()}`,
      original_description: `Recuento Físico UI. Teórico: ${count.theoretical_stock}, Físico: ${count.physical_stock}`,
      processed_by: 'Mánager (Dashboard)'
    }
  })

  const { error } = await supabase
    .from('stock_movements')
    .insert(movements)

  if (error) {
    throw new Error(`Fallo crítico al insertar movimientos: ${error.message}`)
  }

  revalidatePath('/dashboard/inventory')
  return { success: true, message: `Ajustados ${movements.length} ingredientes.` }
}
