'use server'

import { createClient } from '@/utils/supabase/server'

export async function getIngredientMovements(ingredientId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('stock_movements')
    .select('*')
    .eq('ingredient_id', ingredientId)
    .order('movement_date', { ascending: false })
    .limit(200)

  if (error) {
    throw new Error(`Error al cargar el ledger: ${error.message}`)
  }

  return data
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

type StockMovementRow = {
  correlation_id: string | null
  movement_date: string
  ingredient_id: string
  unit: string
  provenance: unknown
}

type IngredientRow = {
  id: string
  name: string
  unit: string | null
  base_unit: string | null
}

function readPhysicalStock(provenance: unknown): number | null {
  if (!provenance || typeof provenance !== 'object') return null
  const raw = (provenance as Record<string, unknown>).physical_stock
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function sortedIngredientsById(rows: IngredientRow[]): Map<string, IngredientRow> {
  const map = new Map<string, IngredientRow>()
  for (const row of rows) map.set(row.id, row)
  return map
}

export async function getInventoryCountSessions(): Promise<InventoryCountSession[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('stock_movements')
    .select('correlation_id, movement_date, ingredient_id, unit, provenance')
    .eq('movement_type', 'INVENTORY_COUNT')
    .order('movement_date', { ascending: false })

  if (error) {
    throw new Error(`Error al cargar el historial de recuentos: ${error.message}`)
  }

  const rows = (data ?? []) as StockMovementRow[]

  const sessions = new Map<string, InventoryCountSession>()

  for (const row of rows) {
    const physical = readPhysicalStock(row.provenance)
    if (physical === null) continue

    const key = row.correlation_id ?? `movement:${row.ingredient_id}:${row.movement_date}`
    const session = sessions.get(key) ?? {
      id: key,
      counted_at: row.movement_date,
      lines: [],
    }
    if (row.movement_date > session.counted_at) session.counted_at = row.movement_date
    session.lines.push({
      ingredient_id: row.ingredient_id,
      name: '',
      unit: row.unit,
      physical_stock: physical,
    })
    sessions.set(key, session)
  }

  if (sessions.size === 0) return []

  const ingredientIds = Array.from(
    new Set(Array.from(sessions.values()).flatMap((s) => s.lines.map((l) => l.ingredient_id))),
  )

  const { data: ingredientData, error: ingredientError } = await supabase
    .from('ingredients')
    .select('id, name, unit, base_unit')
    .in('id', ingredientIds)

  if (ingredientError) {
    throw new Error(`Error al cargar los ingredientes del recuento: ${ingredientError.message}`)
  }

  const byId = sortedIngredientsById((ingredientData ?? []) as IngredientRow[])

  const result = Array.from(sessions.values()).map((session) => ({
    ...session,
    lines: session.lines
      .map((line) => {
        const ingredient = byId.get(line.ingredient_id)
        return {
          ingredient_id: line.ingredient_id,
          name: ingredient?.name?.trim() || 'Ingrediente',
          unit: ingredient?.base_unit?.trim() || ingredient?.unit?.trim() || line.unit,
          physical_stock: line.physical_stock,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })),
  }))

  return result.sort((a, b) => b.counted_at.localeCompare(a.counted_at))
}
