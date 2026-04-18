'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

/** Recorre sub-recetas desde childId como combo: si alcanza targetId, hay ciclo al enlazar comboId → childId. */
async function childComboTreeContains(
  supabase: Awaited<ReturnType<typeof createClient>>,
  childId: string,
  targetId: string
): Promise<boolean> {
  const queue = [childId]
  const visited = new Set<string>()
  while (queue.length) {
    const c = queue.shift()!
    if (c === targetId) return true
    if (visited.has(c)) continue
    visited.add(c)
    const { data } = await supabase
      .from('recipe_combos')
      .select('child_recipe_id')
      .eq('combo_recipe_id', c)
    for (const row of data || []) queue.push(row.child_recipe_id as string)
  }
  return false
}

export async function getComboItems(comboRecipeId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('recipe_combos')
    .select('id, quantity, child_recipe:child_recipe_id (id, name, category, photo_url)')
    .eq('combo_recipe_id', comboRecipeId)

  if (error) throw new Error(`Error cargando menú: ${error.message}`)
  return data || []
}

export async function addComboItem(comboRecipeId: string, childRecipeId: string, quantity: number) {
  const supabase = await createClient()
  if (childRecipeId === comboRecipeId) {
    throw new Error('Un menú no puede incluirse a sí mismo como sub-receta.')
  }
  const cycle = await childComboTreeContains(supabase, childRecipeId, comboRecipeId)
  if (cycle) {
    throw new Error('No se puede crear una referencia circular entre recetas del menú.')
  }
  const { error } = await supabase
    .from('recipe_combos')
    .insert({ combo_recipe_id: comboRecipeId, child_recipe_id: childRecipeId, quantity })

  if (error) {
    if (error.code === '23505') throw new Error('Esta receta ya está en el menú. Elimínala y vuelve a añadirla con otra cantidad.')
    throw new Error(`Error añadiendo ítem: ${error.message}`)
  }
  revalidatePath(`/recipes/${comboRecipeId}`)
  return { success: true }
}

export async function removeComboItem(comboId: string, comboRecipeId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('recipe_combos').delete().eq('id', comboId)
  if (error) throw new Error(`Error eliminando ítem: ${error.message}`)
  revalidatePath(`/recipes/${comboRecipeId}`)
  return { success: true }
}
