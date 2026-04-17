'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function upsertMapping(
  articulo_id: number,
  recipe_id: string,
  factor_porcion: number
) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { success: false, error: 'Unauthorized' as const }
  }

  const { error } = await supabase
    .from('map_tpv_receta')
    .upsert(
      { articulo_id, recipe_id, factor_porcion },
      { onConflict: 'articulo_id', ignoreDuplicates: false }
    )

  if (error) {
    console.error('upsertMapping error:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/recetas-tpv')
  return { success: true as const }
}

export async function deleteMapping(articulo_id: number) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { success: false, error: 'Unauthorized' as const }
  }

  const { error } = await supabase
    .from('map_tpv_receta')
    .delete()
    .eq('articulo_id', articulo_id)

  if (error) {
    console.error('deleteMapping error:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/recetas-tpv')
  return { success: true as const }
}

