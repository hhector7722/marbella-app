'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

async function requireManagerInventorySettings() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { ok: false as const, supabase, error: 'Unauthorized' as const }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    return { ok: false as const, supabase, error: profileError.message }
  }

  const role = (profile?.role ?? null) as string | null
  if (role !== 'manager' && role !== 'admin') {
    return { ok: false as const, supabase, error: 'Forbidden' as const }
  }

  return { ok: true as const, supabase, userId: user.id }
}

export async function saveIngredientsInventoryVisibility(
  updates: { ingredient_id: string; inventory_visible: boolean }[],
) {
  const gate = await requireManagerInventorySettings()
  if (!gate.ok) {
    throw new Error(gate.error === 'Forbidden' ? 'Sin permiso.' : 'No autorizado.')
  }

  const supabase = gate.supabase

  const results = await Promise.all(
    updates.map((row) =>
      supabase
        .from('ingredients')
        .update({ inventory_visible: row.inventory_visible })
        .eq('id', row.ingredient_id),
    ),
  )

  for (const r of results) {
    if (r.error) {
      throw new Error(`No se pudo actualizar la visibilidad: ${r.error.message}`)
    }
  }

  revalidatePath('/dashboard/inventory')
  return { success: true as const }
}

interface CountPayload {
  ingredient_id: string
  physical_stock: number
  theoretical_stock: number
  unit: string
}

export async function processInventoryCounts(counts: CountPayload[]) {
  const gate = await requireManagerInventorySettings()
  if (!gate.ok) {
    throw new Error(gate.error === 'Forbidden' ? 'Solo mánager o administración puede certificar un recuento.' : 'No autorizado.')
  }
  const supabase = gate.supabase
  
  const actionableCounts = counts.filter(
    (c) => c.physical_stock !== c.theoretical_stock
  )

  if (actionableCounts.length === 0) {
    return {
      success: true,
      message:
        'Recuento recibido. No fue necesario registrar movimientos de stock para las cantidades indicadas.',
    }
  }

  const correlationId = crypto.randomUUID()
  const items = actionableCounts.map((count) => {
    const delta = count.physical_stock - count.theoretical_stock
    return {
      ingredient_id: count.ingredient_id,
      quantity_base: delta,
      unit_base: count.unit,
      physical_stock: count.physical_stock,
      theoretical_stock: count.theoretical_stock,
    }
  })

  const { data, error } = await supabase.rpc('record_inventory_count_movements', {
    p_items: items,
    p_correlation_id: correlationId,
  })

  if (error) {
    throw new Error(`Fallo crítico al registrar el recuento: ${error.message}`)
  }

  const inserted = Number((data as { inserted_count?: number } | null)?.inserted_count ?? 0)

  revalidatePath('/dashboard/inventory')
  return {
    success: true,
    message: `Recuento aplicado: ${inserted} ${
      inserted === 1 ? 'actualización' : 'actualizaciones'
    } de stock.`,
  }
}
