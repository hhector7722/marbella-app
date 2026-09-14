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
  const movements = actionableCounts.map((count, index) => {
    const delta = count.physical_stock - count.theoretical_stock
    const referenceExternalId = `INV-${correlationId}-${count.ingredient_id}`

    return {
      movement_type: 'INVENTORY_COUNT',
      ingredient_id: count.ingredient_id,
      quantity: delta,
      unit: count.unit,
      reference_doc: referenceExternalId,
      original_description: `Recuento físico (${count.physical_stock} ${count.unit})`,
      processed_by: 'Mánager (Dashboard)',
      reference_type: 'inventory_count' as const,
      reference_external_id: referenceExternalId,
      idempotency_key: `inventory-count:${correlationId}:${index}`,
      origin: 'inventory_count' as const,
      actor_profile_id: gate.userId,
      correlation_id: correlationId,
      provenance: { source: 'dashboard_inventory', schema_version: 'k2' },
    }
  })

  const { error } = await supabase
    .from('stock_movements')
    .insert(movements)

  if (error) {
    throw new Error(`Fallo crítico al insertar movimientos: ${error.message}`)
  }

  revalidatePath('/dashboard/inventory')
  return {
    success: true,
    message: `Recuento aplicado: ${movements.length} ${
      movements.length === 1 ? 'actualización' : 'actualizaciones'
    } de stock.`,
  }
}
