'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

type CanonicalUnit = 'kg' | 'l' | 'ud'

type Gate =
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; userId: string }
  | { ok: false; message: string }

async function gateManager(): Promise<Gate> {
  const supabase = await createClient()
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()

  if (sessionError) return { ok: false, message: sessionError.message }
  const user = session?.user
  if (!user) return { ok: false, message: 'No autenticado' }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (error) return { ok: false, message: error.message }
  if (profile?.role !== 'manager' && profile?.role !== 'admin') {
    return { ok: false, message: 'Sin permiso para modificar ingredientes' }
  }

  return { ok: true, supabase, userId: user.id }
}

function canonicalUnit(value: string): CanonicalUnit | null {
  const unit = String(value ?? '').trim().toLowerCase()
  if (unit === 'kg') return 'kg'
  if (unit === 'l' || unit === 'lt' || unit === 'litro') return 'l'
  if (unit === 'ud' || unit === 'u' || unit === 'unidad') return 'ud'
  return null
}

export async function setIngredientCanonicalPriceAction(params: {
  ingredientId: string
  currentPrice: number
  priceLocked?: boolean | null
  reason?: string | null
}): Promise<{ success: true } | { success: false; message: string }> {
  const gate = await gateManager()
  if (!gate.ok) return { success: false, message: gate.message }

  const ingredientId = String(params.ingredientId ?? '').trim()
  const currentPrice = Number(params.currentPrice)

  if (!ingredientId) return { success: false, message: 'Ingrediente inválido' }
  if (!Number.isFinite(currentPrice) || currentPrice < 0) {
    return { success: false, message: 'Precio inválido' }
  }

  const { data, error } = await gate.supabase.rpc('set_ingredient_price_manual', {
    p_ingredient_id: ingredientId,
    p_current_price: currentPrice,
    p_price_locked: params.priceLocked ?? null,
    p_reason: params.reason ?? null,
  })

  if (error) return { success: false, message: error.message }
  if ((data as { ok?: boolean } | null)?.ok !== true) {
    return { success: false, message: 'No se pudo actualizar el precio' }
  }

  revalidatePath('/ingredients')
  return { success: true }
}

export async function createCanonicalIngredientAction(params: {
  name: string
  category: string
  purchaseUnit: string
  currentPrice?: number | null
  priceLocked?: boolean
  supplier?: string | null
  supplier2?: string | null
  wastePercentage?: number | null
  orderUnit?: string | null
  recipeUnit?: string | null
  recommendedStock?: number | null
}): Promise<{ success: true; ingredientId: string } | { success: false; message: string }> {
  const gate = await gateManager()
  if (!gate.ok) return { success: false, message: gate.message }

  const name = String(params.name ?? '').trim()
  if (!name) return { success: false, message: 'El nombre es obligatorio' }

  const purchaseUnit = canonicalUnit(params.purchaseUnit)
  if (!purchaseUnit) return { success: false, message: 'Unidad de compra inválida' }

  const priceRaw = params.currentPrice == null ? 0 : Number(params.currentPrice)
  if (!Number.isFinite(priceRaw) || priceRaw < 0) {
    return { success: false, message: 'Precio inválido' }
  }

  const recipeUnit =
    String(params.recipeUnit ?? '').trim() ||
    (purchaseUnit === 'kg' ? 'g' : purchaseUnit === 'l' ? 'ml' : 'ud')

  const { data, error } = await gate.supabase
    .from('ingredients')
    .insert({
      name,
      category: String(params.category ?? 'Alimentos').trim() || 'Alimentos',
      current_price: priceRaw,
      purchase_unit: purchaseUnit,
      unit_type: purchaseUnit,
      supplier_pricing_mode: 'per_purchase_unit',
      pack_price: null,
      pack_units: null,
      supplier: params.supplier || null,
      supplier_2: params.supplier2 || null,
      waste_percentage: Number(params.wastePercentage ?? 0) || 0,
      order_unit: String(params.orderUnit ?? 'unidad').trim() || 'unidad',
      recipe_unit: recipeUnit,
      recommended_stock:
        params.recommendedStock == null || !Number.isFinite(Number(params.recommendedStock))
          ? null
          : Number(params.recommendedStock),
      price_locked: params.priceLocked === true,
    })
    .select('id')
    .single()

  if (error) return { success: false, message: error.message }
  if (!data?.id) return { success: false, message: 'No se pudo crear el ingrediente' }

  revalidatePath('/ingredients')
  return { success: true, ingredientId: String(data.id) }
}
