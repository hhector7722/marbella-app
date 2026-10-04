import { createClient } from '@/utils/supabase/server'
import { LedgerClient } from './LedgerClient'

export const dynamic = 'force-dynamic'

export default async function LedgerPage() {
  const supabase = await createClient()

  const { data: ingredients, error } = await supabase
    .from('ingredients')
    .select('id, name, unit, stock_current, category, image_url, order_unit')
    .is('archived_at', null)
    .order('category', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw new Error('Fallo al cargar base de inventario')

  const { data: inventoryMovements, error: inventoryError } = await supabase
    .from('stock_movements')
    .select('ingredient_id')
    .eq('movement_type', 'INVENTORY_COUNT')

  if (inventoryError) throw new Error('Fallo al cargar productos inventariados')

  const inventoriedIds = new Set((inventoryMovements ?? []).map((row) => row.ingredient_id))

  return (
    <LedgerClient
      ingredients={(ingredients || []).map((ingredient) => ({
        ...ingredient,
        has_inventory_count: inventoriedIds.has(ingredient.id),
      }))}
    />
  )
}
