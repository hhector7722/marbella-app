'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export type WasteLine = {
  ingredient_id: string
  quantity: number
  unit: string
}

export async function processWasteEntries(lines: WasteLine[]) {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('Sesión no válida. Vuelve a iniciar sesión.')
  }

  const actionable = lines.filter((l) => Number.isFinite(l.quantity) && l.quantity > 0)
  if (actionable.length === 0) {
    return { success: true, message: 'No hay cantidades de merma que registrar.' }
  }

  const stamp = Date.now()
  const movements = actionable.map((line, idx) => ({
    movement_type: 'WASTE' as const,
    ingredient_id: line.ingredient_id,
    quantity: line.quantity,
    unit: line.unit,
    reference_doc: `WASTE-${stamp}-${idx}`,
    original_description: 'Merma manual (dashboard)',
    processed_by: user.email ?? user.id,
  }))

  const { error } = await supabase.from('stock_movements').insert(movements)

  if (error) {
    console.error('processWasteEntries:', error)
    throw new Error(`No se pudo registrar la merma: ${error.message}`)
  }

  revalidatePath('/dashboard/inventory/waste')
  revalidatePath('/dashboard/inventory/ledger')
  revalidatePath('/dashboard/inventory')

  return { success: true, message: `Registrada${actionable.length === 1 ? '' : 's'} ${actionable.length} merma${actionable.length === 1 ? '' : 's'}.` }
}
