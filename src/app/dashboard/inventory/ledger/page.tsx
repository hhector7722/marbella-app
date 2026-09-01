import { createClient } from '@/utils/supabase/server'
import { LedgerClient } from './LedgerClient'

export const dynamic = 'force-dynamic'

export default async function LedgerPage() {
  const supabase = await createClient()

  const { data: ingredients, error } = await supabase
    .from('ingredients')
    .select('id, name, unit, stock_current, category, image_url, order_unit')
    .order('category', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw new Error('Fallo al cargar base de inventario')

  return <LedgerClient ingredients={ingredients || []} />
}
