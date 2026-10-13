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
  const [{ data: ingredients, error }, stockResult, meterBalances] = await Promise.all([
    supabase
      .from('ingredients')
      .select('id, name, unit, base_unit, category, image_url, order_unit')
      .eq('inventory_visible', true)
      .is('archived_at', null)
      .order('category', { ascending: true })
      .order('name', { ascending: true }),
    supabase.rpc('get_unit_stock_status' as never),
    // El saldo de metros procede del libro histórico por unidad (no del
    // motor exclusivo de productos unitarios Stock 2.0).
    supabase.from('stock_current').select('ingredient_id,unit,quantity').eq('unit', 'm'),
  ])

  if (error) throw new Error('Fallo al cargar productos activos de Inventario')
  if (stockResult.error) throw new Error('Fallo al cargar el nuevo Stock 2.0')
  if (meterBalances.error) throw new Error('Fallo al cargar el saldo en metros.')

  const meterBalanceById = new Map((meterBalances.data ?? []).map(
    (row) => [row.ingredient_id, Number(row.quantity)],
  ))
  const stateById = new Map(
    ((stockResult.data ?? []) as UnitStockStatus[]).map((row) => [row.ingredient_id, row]),
  )

  return (
    <LedgerClient
      ingredients={(ingredients ?? []).map((ingredient) => {
        const current = stateById.get(ingredient.id)
        const isMeter = ingredient.base_unit === 'm'
        return {
          ...ingredient,
          // Metro: saldo exclusivamente de movimientos en m. Nunca se suman
          // las compras históricas en gramos ni se tratan como Stock 2.0 ud.
          stock_current: isMeter
            ? (meterBalanceById.get(ingredient.id) ?? 0)
            : current?.stock_units == null ? null : Number(current.stock_units),
          has_inventory_count: isMeter || Boolean(current?.baseline_at),
          stock_tracked: isMeter || current?.stock_tracked === true,
        }
      })}
    />
  )
}
