import { createClient } from '@/utils/supabase/server'
import { LedgerClient } from './LedgerClient'

export const dynamic = 'force-dynamic'

type UnitStockStatus = {
  ingredient_id: string
  stock_units: number | string | null
  baseline_at: string | null
  stock_tracked: boolean
}

export default async function LedgerPage() {
  const supabase = await createClient()

  // Fuente de productos IDENTICA a Inventario. No depende de recuentos antiguos.
  const [{ data: ingredients, error }, stockResult] = await Promise.all([
    supabase
      .from('ingredients')
      .select('id, name, unit, base_unit, category, image_url, order_unit')
      .eq('inventory_visible', true)
      .is('archived_at', null)
      .order('category', { ascending: true })
      .order('name', { ascending: true }),
    supabase.rpc('get_unit_stock_status' as never),
  ])

  if (error) throw new Error('Fallo al cargar productos activos de Inventario')
  if (stockResult.error) throw new Error('Fallo al cargar el nuevo Stock 2.0')

  const stateById = new Map(
    ((stockResult.data ?? []) as UnitStockStatus[]).map((row) => [row.ingredient_id, row]),
  )

  return (
    <LedgerClient
      ingredients={(ingredients ?? []).map((ingredient) => {
        const current = stateById.get(ingredient.id)
        return {
          ...ingredient,
          // NULL = todavía no se ha realizado inventario inicial. Nunca mostrar
          // el `ingredients.stock_current` histórico como si fuera Stock 2.0.
          stock_current: current?.stock_units == null ? null : Number(current.stock_units),
          has_inventory_count: Boolean(current?.baseline_at),
          stock_tracked: current?.stock_tracked === true,
        }
      })}
    />
  )
}
