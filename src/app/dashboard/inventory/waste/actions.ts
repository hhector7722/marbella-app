'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { RecipeWasteError, recipeWasteItemsFromRows } from '@/lib/recipe-waste'

async function requireManagerStockWrite() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('Sesión no válida. Vuelve a iniciar sesión.')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || (profile?.role !== 'manager' && profile?.role !== 'admin')) {
    throw new Error('Solo mánager o administración puede registrar movimientos de stock.')
  }

  return { supabase, user }
}

export type WasteLine = {
  ingredient_id: string
  quantity: number
  unit: string
}

export async function processWasteEntries(lines: WasteLine[]) {
  const { supabase } = await requireManagerStockWrite()

  const actionable = lines.filter((l) => Number.isFinite(l.quantity) && l.quantity > 0)
  if (actionable.length === 0) {
    return { success: true, message: 'No hay cantidades de merma que registrar.' }
  }

  const correlationId = crypto.randomUUID()
  const items = actionable.map((line) => ({
    ingredient_id: line.ingredient_id,
    quantity_base: line.quantity,
    unit_base: line.unit,
    description: 'Merma manual (ingredientes)',
  }))

  const { error } = await supabase.rpc('record_waste_movements', {
    p_items: items,
    p_correlation_id: correlationId,
    p_source: 'dashboard_waste',
  })

  if (error) {
    console.error('processWasteEntries:', error)
    throw new Error(`No se pudo registrar la merma: ${error.message}`)
  }

  revalidatePath('/dashboard/inventory/waste')
  revalidatePath('/dashboard/inventory/ledger')
  revalidatePath('/dashboard/inventory')

  return {
    success: true,
    message: `Registrada${actionable.length === 1 ? '' : 's'} ${actionable.length} merma${actionable.length === 1 ? '' : 's'}.`,
  }
}

export async function processRecipeWaste(recipeId: string, units: number) {
  const { supabase } = await requireManagerStockWrite()

  if (!Number.isFinite(units) || units <= 0) {
    throw new Error('Indica un número de unidades mayor que cero.')
  }

  const { data: recipe, error: recipeErr } = await supabase
    .from('recipes')
    .select('id, name')
    .eq('id', recipeId)
    .maybeSingle()

  if (recipeErr || !recipe) {
    throw new Error('No se encontró la receta.')
  }

  const { data: rows, error: expansionErr } = await supabase.rpc('recipe_stock_requirements_v2_rows', {
    p_recipe_id: recipeId,
    p_recipe_multiplier: units,
  })

  if (expansionErr) {
    console.error('processRecipeWaste expansion:', { recipeId, expansionErr })
    throw new Error('No se pudo cargar la expansión de la receta.')
  }

  let items
  try {
    items = recipeWasteItemsFromRows(rows ?? [], recipe.name, units)
  } catch (err) {
    if (err instanceof RecipeWasteError && err.expansionErrors != null) {
      console.error('processRecipeWaste expansion:', { recipeId, errors: err.expansionErrors })
    }
    throw err
  }

  const correlationId = crypto.randomUUID()

  const { error } = await supabase.rpc('record_waste_movements', {
    p_items: items,
    p_correlation_id: correlationId,
    p_source: 'dashboard_recipe_waste',
  })

  if (error) {
    console.error('processRecipeWaste insert:', error)
    throw new Error(`No se pudo registrar la merma: ${error.message}`)
  }

  revalidatePath('/dashboard/inventory/waste')
  revalidatePath('/dashboard/inventory/ledger')
  revalidatePath('/dashboard/inventory')

  return {
    success: true,
    message: `Merma registrada: ${recipe.name} × ${units} ud (${items.length} ingredientes).`,
  }
}
