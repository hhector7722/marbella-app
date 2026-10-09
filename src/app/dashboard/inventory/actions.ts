'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

function isManagerRole(role: string | null | undefined): boolean {
  return role === 'manager' || role === 'admin'
}

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
  if (!isManagerRole(role)) {
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
  revalidatePath('/dashboard/inventory/ledger')
  return { success: true as const }
}

interface CountPayload {
  ingredient_id: string
  physical_stock: number
  theoretical_stock: number
  quantity_barra: number
  quantity_camara: number
  unit: string
}

/**
 * Guarda un recuento. Gerencia (`manager`/`admin`) lo certifica en el acto y
 * produce movimientos de stock; el resto lo deja como recuento pendiente para
 * que gerencia lo revise y certifique. La persona que cuenta no ve distinción.
 */
export async function processInventoryCounts(counts: CountPayload[]) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    throw new Error('No autorizado.')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    throw new Error(profileError.message)
  }

  // Stock 2.0: el primer recuento unitario debe ser completo e incluir
  // explícitamente las unidades a cero. No consumir ajustes del stock antiguo.
  const { data: activeUnits, error: unitsError } = await supabase
    .from('ingredients')
    .select('id')
    .eq('inventory_visible', true)
    .eq('base_unit', 'ud')
    .is('archived_at', null)

  if (unitsError) throw new Error('No se pudo comprobar la lista de Inventario.')
  const supplied = new Set(counts.map((item) => item.ingredient_id))
  const missing = (activeUnits ?? []).filter((item) => !supplied.has(item.id))
  if (missing.length) {
    throw new Error(`Faltan ${missing.length} productos por contar. Indica también 0 en los que no tengas existencias.`)
  }

  // Guardar siempre una captura auditada, tanto para gerencia como para personal.
  // Se incluye el desglose Barra/Cámara para no perder lo que realmente se contó.
  const { data: submitted, error: submitError } = await supabase.rpc('submit_inventory_count', {
    p_items: counts.map((count) => ({
      ingredient_id: count.ingredient_id,
      physical_stock: count.physical_stock,
      theoretical_stock: count.theoretical_stock,
      quantity_barra: count.quantity_barra,
      quantity_camara: count.quantity_camara,
      unit: count.unit,
    })),
  })

  if (submitError) {
    throw new Error(`No se pudo guardar el recuento: ${submitError.message}`)
  }

  if (!isManagerRole(profile?.role)) {
    revalidatePath('/dashboard/inventory')
    return { success: true as const, message: 'Recuento guardado para certificar.' }
  }

  const countId = (submitted as { count_id?: string } | null)?.count_id
  if (!countId) throw new Error('Recuento guardado, pero no se devolvió su identificador. Revisar pendientes.')

  // Gerencia certifica exclusivamente el NUEVO libro Stock 2.0.
  // La operación NO llama a record_inventory_count_movements.
  const { error: certifyError } = await supabase.rpc(
    'certify_unit_stock_count' as never,
    { p_count_id: countId } as never,
  )
  if (certifyError) {
    // La captura ya existe como pendiente; nunca fingir éxito ni repetir el
    // formulario porque podría sobrescribir el pendiente.
    throw new Error(`Recuento guardado como pendiente; no se pudo iniciar Stock 2.0: ${certifyError.message}`)
  }

  revalidatePath('/dashboard/inventory')
  revalidatePath('/dashboard/inventory/ledger')
  return {
    success: true as const,
    message: `Inventario certificado: ${activeUnits?.length ?? 0} productos unitarios. Stock 2.0 iniciado sin alterar el stock antiguo.`,
  }
}

export type PendingInventoryCount = {
  id: string
  createdAt: string
  createdByName: string
  lineCount: number
  differenceCount: number
}

export type InventoryCountLine = {
  ingredientId: string
  ingredientName: string
  unit: string
  quantityBarra: number
  quantityCamara: number
  total: number
}

export type PendingInventoryCountDetail = {
  id: string
  createdAt: string
  createdByName: string
  lines: InventoryCountLine[]
}

/** Recuentos pendientes de certificar. Solo gerencia. */
export async function listPendingInventoryCounts(): Promise<PendingInventoryCount[]> {
  const gate = await requireManagerInventorySettings()
  if (!gate.ok) return []

  const supabase = gate.supabase

  const { data: counts, error } = await supabase
    .from('inventory_counts')
    .select('id, created_at, created_by')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error || !counts?.length) return []

  const countIds = counts.map((c) => c.id)
  const authorIds = Array.from(new Set(counts.map((c) => c.created_by)))

  const [authorsRes, linesRes] = await Promise.all([
    supabase.from('profiles').select('id, first_name, last_name').in('id', authorIds),
    supabase.from('inventory_count_lines').select('count_id, delta').in('count_id', countIds),
  ])

  const nameById = new Map<string, string>()
  for (const author of authorsRes.data ?? []) {
    const name = [author.first_name, author.last_name].filter(Boolean).join(' ').trim()
    nameById.set(author.id, name || 'Empleado')
  }

  const totals = new Map<string, { lines: number; differences: number }>()
  for (const line of linesRes.data ?? []) {
    const current = totals.get(line.count_id) ?? { lines: 0, differences: 0 }
    current.lines += 1
    if (Number(line.delta) !== 0) current.differences += 1
    totals.set(line.count_id, current)
  }

  return counts.map((count) => {
    const total = totals.get(count.id) ?? { lines: 0, differences: 0 }
    return {
      id: count.id,
      createdAt: count.created_at,
      createdByName: nameById.get(count.created_by) ?? 'Empleado',
      lineCount: total.lines,
      differenceCount: total.differences,
    }
  })
}

/** Detalle de un recuento pendiente. Solo gerencia. */
export async function getInventoryCountDetail(
  countId: string,
): Promise<PendingInventoryCountDetail | null> {
  const gate = await requireManagerInventorySettings()
  if (!gate.ok) return null

  const supabase = gate.supabase

  const { data: count, error } = await supabase
    .from('inventory_counts')
    .select('id, created_at, created_by')
    .eq('id', countId)
    .maybeSingle()

  if (error || !count) return null

  const [{ data: author }, { data: lines }] = await Promise.all([
    supabase.from('profiles').select('first_name, last_name').eq('id', count.created_by).maybeSingle(),
    supabase
      .from('inventory_count_lines')
      .select('ingredient_id, physical_stock, quantity_barra, quantity_camara, unit')
      .eq('count_id', countId),
  ])

  const ingredientIds = Array.from(new Set((lines ?? []).map((l) => l.ingredient_id)))
  const { data: ingredients } = ingredientIds.length
    ? await supabase.from('ingredients').select('id, name').in('id', ingredientIds)
    : { data: [] as { id: string; name: string }[] }

  const nameById = new Map<string, string>()
  for (const ingredient of ingredients ?? []) {
    nameById.set(ingredient.id, ingredient.name)
  }

  const detailLines: InventoryCountLine[] = (lines ?? []).map((line) => ({
    ingredientId: line.ingredient_id,
    ingredientName: nameById.get(line.ingredient_id) ?? 'Ingrediente',
    unit: line.unit,
    quantityBarra: Number(line.quantity_barra) || 0,
    quantityCamara: Number(line.quantity_camara) || 0,
    total: Number(line.physical_stock) || 0,
  }))

  const createdByName =
    [author?.first_name, author?.last_name].filter(Boolean).join(' ').trim() || 'Empleado'

  return { id: count.id, createdAt: count.created_at, createdByName, lines: detailLines }
}

/** Certifica un recuento pendiente: escribe el ledger y lo marca como certificado. */
export async function certifyInventoryCount(countId: string) {
  const gate = await requireManagerInventorySettings()
  if (!gate.ok) {
    throw new Error(gate.error === 'Forbidden' ? 'Sin permiso.' : 'No autorizado.')
  }

  const { data, error } = await gate.supabase.rpc('certify_unit_stock_count' as never, {
    p_count_id: countId,
  } as never)

  if (error) {
    throw new Error(error.message)
  }

  const certified = Number((data as { certified_unit_products?: number } | null)?.certified_unit_products ?? 0)
  revalidatePath('/dashboard/inventory')
  revalidatePath('/dashboard/inventory/ledger')

  return {
    success: true as const,
    message: `Stock 2.0 certificado: ${certified} productos unitarios. Sin modificar el stock antiguo.`,
  }
}

/** Rechaza un recuento pendiente sin producir movimientos. */
export async function rejectInventoryCount(countId: string, reason?: string) {
  const gate = await requireManagerInventorySettings()
  if (!gate.ok) {
    throw new Error(gate.error === 'Forbidden' ? 'Sin permiso.' : 'No autorizado.')
  }

  const { error } = await gate.supabase.rpc('reject_inventory_count', {
    p_count_id: countId,
    p_reason: reason ?? undefined,
  })

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath('/dashboard/inventory')
  return { success: true as const }
}
