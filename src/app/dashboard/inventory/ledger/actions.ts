'use server'

import { createClient } from '@/utils/supabase/server'

type StockResult = {
  ingredient_id: string
  stock_units: number | null
  baseline_at: string | null
  stock_tracked: boolean
}

/**
 * Stock 2.0 solo expone movimientos posteriores al recuento inicial del
 * ingrediente. Los tickets e informes históricos permanecen íntegros.
 */
export async function getIngredientMovements(ingredientId: string) {
  const supabase = await createClient()
  const { data: projected, error: projectionError } = await supabase.rpc(
    'get_unit_stock_status' as never,
  )
  if (projectionError) throw new Error(`No se pudo cargar Stock 2.0: ${projectionError.message}`)
  const { data: ingredient, error: ingredientError } = await supabase
    .from('ingredients').select('base_unit').eq('id', ingredientId).maybeSingle()
  if (ingredientError) throw new Error('No se pudo verificar la unidad del ingrediente.')
  const isMeters = ingredient?.base_unit === 'm'
  const baseline = ((projected ?? []) as StockResult[]).find(
    (row) => row.ingredient_id === ingredientId,
  )

  // Stock 2.0 en unidades empieza exclusivamente tras el recuento certificado.
  // En metros conservamos el historial original con su unidad, sin mezclar saldos.
  if (!isMeters && (!baseline?.baseline_at || !baseline.stock_tracked)) return []

  // No limitar a 200: un corte a mitad de día falsearía los totales diarios.
  // Paginación estable por fecha + id, evitando el límite de PostgREST por petición.
  const PAGE_SIZE = 500
  const MAX_ROWS = 10000
  const accumulated: Array<{
    id: string
    movement_type: string
    quantity: number
    unit: string
    movement_date: string
    reference_doc: string | null
    original_description: string | null
    processed_by: string | null
    origin: string | null
  }> = []

  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    let query = supabase
      .from('stock_movements')
      .select('id, movement_type, quantity, unit, movement_date, reference_doc, original_description, processed_by, origin')
      .eq('ingredient_id', ingredientId)

    if (!isMeters) {
      query = query
        .gt('movement_date', baseline!.baseline_at!)
        .in('movement_type', ['PURCHASE', 'SALE', 'WASTE', 'ADJUSTMENT'])
        .in('unit', ['ud', 'u', 'un'])
        .in('origin', ['legacy', 'receipt_confirmation', 'sale_webhook', 'staff_consumption', 'manager_adjustment'])
    }

    const { data, error } = await query
      .order('movement_date', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw new Error('No se pudieron cargar los movimientos de stock: ' + error.message)
    accumulated.push(...(data ?? []))
    if ((data?.length ?? 0) < PAGE_SIZE) return accumulated
  }
  // Nunca mostrar agregados de días incompletos como si fueran totales.
  throw new Error('Este producto tiene más de 10.000 movimientos. No se puede mostrar un total diario parcial.')

}

export type InventoryCountLine = {
  ingredient_id: string
  name: string
  unit: string
  physical_stock: number
}

export type InventoryCountSession = {
  id: string
  counted_at: string
  lines: InventoryCountLine[]
}

/**
 * El historial visible comienza con los recuentos certificados tras el corte
 * del 09/10. No borrar el historial financiero ni los movimientos anteriores.
 */
export async function getInventoryCountSessions(): Promise<InventoryCountSession[]> {
  const supabase = await createClient()
  const { data: counts, error } = await supabase
    .from('inventory_counts')
    .select('id, created_at')
    .eq('status', 'certified')
    .gte('created_at', '2026-10-08T22:00:00Z')
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Error al cargar los nuevos recuentos: ${error.message}`)
  if (!counts?.length) return []

  const { data: lines, error: lineError } = await supabase
    .from('inventory_count_lines')
    .select('count_id, ingredient_id, physical_stock, unit')
    .in('count_id', counts.map((count) => count.id))
  if (lineError) throw new Error(`Error al cargar las cantidades contadas: ${lineError.message}`)

  const ingredientIds = Array.from(new Set((lines ?? []).map((line) => line.ingredient_id)))
  const { data: ingredients, error: ingredientError } = ingredientIds.length
    ? await supabase.from('ingredients').select('id, name').in('id', ingredientIds)
    : { data: [] as { id: string; name: string }[], error: null }
  if (ingredientError) throw new Error(`Error al cargar productos: ${ingredientError.message}`)

  const names = new Map((ingredients ?? []).map((item) => [item.id, item.name]))
  return counts.map((count) => ({
    id: count.id,
    counted_at: count.created_at,
    lines: (lines ?? [])
      .filter((line) => line.count_id === count.id && ['ud', 'u', 'un'].includes(line.unit))
      .map((line) => ({
        ingredient_id: line.ingredient_id,
        name: names.get(line.ingredient_id) || 'Producto',
        unit: 'ud',
        physical_stock: Number(line.physical_stock),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })),
  }))
}
