'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

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
  const { supabase, user } = await requireManagerStockWrite()

  const actionable = lines.filter((l) => Number.isFinite(l.quantity) && l.quantity > 0)
  if (actionable.length === 0) {
    return { success: true, message: 'No hay cantidades de merma que registrar.' }
  }

  const correlationId = crypto.randomUUID()
  const movements = actionable.map((line, idx) => ({
    movement_type: 'WASTE' as const,
    ingredient_id: line.ingredient_id,
    quantity: line.quantity,
    unit: line.unit,
    reference_doc: `WASTE-${correlationId}-${idx}`,
    original_description: 'Merma manual (ingredientes)',
    processed_by: user.email ?? user.id,
    reference_type: 'waste_entry' as const,
    reference_external_id: `WASTE-${correlationId}-${idx}`,
    idempotency_key: `waste:${correlationId}:${idx}`,
    origin: 'manager_adjustment' as const,
    actor_profile_id: user.id,
    correlation_id: correlationId,
    provenance: { source: 'dashboard_waste', schema_version: 'k2' },
  }))

  const { error } = await supabase.from('stock_movements').insert(movements)

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

type RecipeLineRow = {
  ingredient_id: string
  quantity_gross: number
  umb_multiplier: number
  ingredients: { unit: string } | { unit: string }[] | null
}

function ingredientUnitFromRow(row: RecipeLineRow): string | null {
  const ing = row.ingredients
  if (!ing) return null
  const u = Array.isArray(ing) ? ing[0]?.unit : ing.unit
  return u?.trim() || null
}

export async function processRecipeWaste(recipeId: string, units: number) {
  const { supabase, user } = await requireManagerStockWrite()

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

  const { data: rows, error: linesErr } = await supabase
    .from('recipe_ingredients')
    .select('ingredient_id, quantity_gross, umb_multiplier, ingredients ( unit )')
    .eq('recipe_id', recipeId)

  if (linesErr) {
    console.error('processRecipeWaste lines:', linesErr)
    throw new Error('No se pudo cargar el desglose de la receta.')
  }

  const list = (rows ?? []) as unknown as RecipeLineRow[]
  if (list.length === 0) {
    throw new Error('Esta receta no tiene ingredientes enlazados.')
  }

  const merged = new Map<string, { quantity: number; unit: string }>()

  for (const row of list) {
    const ingUnit = ingredientUnitFromRow(row)
    if (!ingUnit) {
      throw new Error(`Falta unidad de almacén para un ingrediente de la receta.`)
    }
    const piece =
      units * Number(row.quantity_gross) * Number(row.umb_multiplier ?? 1)
    if (!Number.isFinite(piece) || piece <= 0) continue

    const prev = merged.get(row.ingredient_id)
    if (prev) {
      merged.set(row.ingredient_id, { quantity: prev.quantity + piece, unit: prev.unit })
    } else {
      merged.set(row.ingredient_id, { quantity: piece, unit: ingUnit })
    }
  }

  if (merged.size === 0) {
    throw new Error('No se pudo calcular consumo para esta receta.')
  }

  const correlationId = crypto.randomUUID()
  const desc = `Merma receta: ${recipe.name} × ${units} ud`

  const movements = Array.from(merged.entries()).map(([ingredient_id, { quantity, unit }], idx) => ({
    movement_type: 'WASTE' as const,
    ingredient_id,
    quantity,
    unit,
    reference_doc: `WASTE-RCP-${correlationId}-${idx}`,
    original_description: desc,
    processed_by: user.email ?? user.id,
    reference_type: 'waste_entry' as const,
    reference_external_id: `WASTE-RCP-${correlationId}-${idx}`,
    idempotency_key: `waste-recipe:${correlationId}:${idx}`,
    origin: 'manager_adjustment' as const,
    actor_profile_id: user.id,
    correlation_id: correlationId,
    provenance: { source: 'dashboard_recipe_waste', schema_version: 'k2' },
  }))

  const { error } = await supabase.from('stock_movements').insert(movements)

  if (error) {
    console.error('processRecipeWaste insert:', error)
    throw new Error(`No se pudo registrar la merma: ${error.message}`)
  }

  revalidatePath('/dashboard/inventory/waste')
  revalidatePath('/dashboard/inventory/ledger')
  revalidatePath('/dashboard/inventory')

  return {
    success: true,
    message: `Merma registrada: ${recipe.name} × ${units} ud (${movements.length} ingredientes).`,
  }
}
