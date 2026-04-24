'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

async function requireManager() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) return { ok: false as const, supabase, error: 'Unauthorized' as const }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) return { ok: false as const, supabase, error: profileError.message }

  const role = (profile?.role ?? null) as string | null
  const allowed = role === 'manager' || role === 'admin' || role === 'supervisor'
  if (!allowed) return { ok: false as const, supabase, error: 'Forbidden' as const }

  return { ok: true as const, supabase }
}

export async function upsertMapping(
  articulo_id: number,
  recipe_id: string,
  factor_porcion: number
) {
  const gate = await requireManager()
  if (!gate.ok) return { success: false, error: gate.error }

  const supabase = gate.supabase

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
  revalidatePath('/staff/carta')
  revalidatePath('/dashboard/carta')
  return { success: true as const }
}

export async function deleteMapping(articulo_id: number) {
  const gate = await requireManager()
  if (!gate.ok) return { success: false, error: gate.error }

  const supabase = gate.supabase

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

