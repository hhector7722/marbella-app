'use server'

import { createClient } from '@/utils/supabase/server'

export async function getIngredientMovements(ingredientId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('stock_movements')
    .select('*')
    .eq('ingredient_id', ingredientId)
    .order('movement_date', { ascending: false })
    .limit(200)

  if (error) {
    throw new Error(`Error al cargar el ledger: ${error.message}`)
  }

  return data
}
