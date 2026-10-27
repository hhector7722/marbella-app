import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Explicit review list. A vendor invoicing kilograms is NOT equivalent to
 * an old SKU measured in units without a measured number of pieces per kg.
 */
export default async function IngredientConsolidationReview() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles')
    .select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'manager' && profile?.role !== 'admin') redirect('/dashboard/inventory')

  const [{ data: reviews, error }, { data: ingredients }] = await Promise.all([
    supabase.from('ingredient_consolidation_conversion_reviews')
      .select('id,supplier_item_name,billed_unit,preferred_invoice_unit,original_base_unit,canonical_base_unit,canonical_ingredient_id,reason,status,created_at')
      .eq('status','needs_verified_conversion')
      .order('created_at', { ascending: false }),
    supabase.from('ingredients').select('id,name').is('archived_at',null),
  ])
  const names = new Map((ingredients ?? []).map(item => [item.id,item.name]))
  const pending = reviews ?? []
  return <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
    <header className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Unificaciones y unidades</h1>
        <p className="text-sm text-zinc-500">Referencias duplicadas unificadas · equivalencias físicas pendientes</p>
      </div>
      <Link href="/dashboard/inventory" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm">Inventario</Link>
    </header>
    <div className="rounded-xl border border-zinc-200 p-4 space-y-2 text-sm">
      <p className="font-semibold">{pending.length} referencias de proveedor con conversión pendiente</p>
      <p>Los ingredientes repetidos ya no están activos. Sus movimientos históricos no se han modificado. La unidad indicada en el albarán se mantiene por separado de la unidad de inventario.</p>
      <p>Para volver a registrar automáticamente la entrada de estos artículos es necesario confirmar una equivalencia medible (por ejemplo, gramos por pieza, unidades por kilo o densidad). Hasta entonces, sus nuevas líneas se revisan manualmente para evitar stock incorrecto.</p>
    </div>
    {error ? <p role="alert" className="text-red-700 text-sm">No se pudieron cargar las equivalencias: {error.message}</p> : null}
    {!error && pending.length===0 ? <p className="text-sm text-zinc-500">No quedan conversiones pendientes.</p> : null}
    <div className="grid gap-3">
      {pending.map(item=><article key={item.id} className="rounded-xl border border-zinc-200 p-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link className="font-semibold underline underline-offset-2" href={`/ingredients/${item.canonical_ingredient_id}`}>
            {names.get(item.canonical_ingredient_id) ?? 'Ingrediente'}
          </Link>
          <span className="text-xs text-amber-700">Necesita equivalencia física</span>
        </div>
        <p className="text-sm text-zinc-600">{item.supplier_item_name}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-md border border-zinc-200 px-2 py-1">Albarán: <strong>{item.billed_unit || item.preferred_invoice_unit}</strong></span>
          <span className="rounded-md border border-zinc-200 px-2 py-1">Inventario: <strong>{item.canonical_base_unit}</strong></span>
        </div>
        <p className="text-xs text-zinc-500">{item.reason}</p>
      </article>)}
    </div>
  </main>
}
