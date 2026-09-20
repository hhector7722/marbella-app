'use server'

import { createClient } from '@/utils/supabase/server'

export type ManualPriceResult =
  | { ok: true; changed: boolean; currentPrice: number; purchaseUnit: string }
  | { ok: false; message: string }

export async function setIngredientCurrentPriceAction(
  ingredientId: string,
  newPrice: number,
): Promise<ManualPriceResult> {
  const id = String(ingredientId ?? '').trim()
  const price = Number(newPrice)

  if (!id || !Number.isFinite(price) || price <= 0) {
    return { ok: false, message: 'El precio debe ser mayor que cero.' }
  }

  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) {
    return { ok: false, message: 'La sesión ha caducado. Vuelve a entrar.' }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle()

  if (profileError || !profile || !['manager', 'admin'].includes(String(profile.role))) {
    return { ok: false, message: 'No tienes permiso para cambiar precios.' }
  }

  const { data, error } = await supabase.rpc('set_ingredient_current_price', {
    p_ingredient_id: id,
    p_new_price: price,
  })

  if (error) {
    return { ok: false, message: 'No se ha podido guardar el precio. Vuelve a intentarlo.' }
  }

  const result = data as Record<string, unknown> | null
  if (!result || result.ok !== true) {
    return {
      ok: false,
      message: typeof result?.message === 'string' ? result.message : 'No se ha podido guardar el precio.',
    }
  }

  return {
    ok: true,
    changed: result.changed === true,
    currentPrice: Number(result.current_price),
    purchaseUnit: String(result.purchase_unit ?? ''),
  }
}
