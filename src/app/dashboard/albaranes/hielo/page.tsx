import { randomUUID } from 'node:crypto'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { recordDonHieloDelivery } from './actions'

export const dynamic = 'force-dynamic'

export default async function DonHieloPage({
  searchParams,
}: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles')
    .select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'manager' && profile?.role !== 'admin') redirect('/dashboard/albaranes')
  const { data: rows, error } = await supabase.from('manual_ice_receipts')
    .select('id,quantity_kg,received_at,note,stock_movement_id')
    .order('received_at', { ascending: false }).limit(20)
  const search = await searchParams
  return <main className="mx-auto max-w-xl space-y-5 px-4 py-5">
    <header className="flex items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">Don Hielo</h1>
        <p className="text-sm text-zinc-500">Entrada rápida de mercancía</p>
      </div>
      <Link href="/dashboard/albaranes" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm">Albaranes</Link>
    </header>
    <div className="rounded-lg border border-zinc-200 p-4 space-y-2">
      <p className="text-sm">Solo producto <strong>Hielo</strong>. Introduce los kilos físicos recibidos y confirma.</p>
      <p className="text-xs text-zinc-500">Actualiza el inventario de hielo; no crea una factura ni inventa precios. Cada recepción queda identificada y no puede contabilizarse dos veces.</p>
    </div>
    {search.error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{search.error}</p> : null}
    {search.ok ? <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Hielo registrado correctamente en inventario.</p> : null}
    <form action={recordDonHieloDelivery} className="space-y-4 rounded-xl border border-zinc-200 p-4">
      <input type="hidden" name="requestId" value={randomUUID()} />
      <label className="block text-sm font-medium">Cantidad recibida (kg)
        <input name="kilos" type="number" required min="0.001" max="500" step="0.001"
          placeholder="Ej. 20" className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white p-3 text-lg text-zinc-900" />
      </label>
      <label className="block text-sm font-medium">Nota (opcional)
        <input name="note" type="text" maxLength={300} placeholder="Ej. 4 bolsas de 5 kg"
          className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white p-3 text-sm text-zinc-900" />
      </label>
      <button type="submit" className="w-full rounded-lg bg-[#36606F] p-3 font-semibold text-white">
        Confirmar entrada de hielo
      </button>
    </form>
    <section className="space-y-2">
      <h2 className="font-semibold">Últimas entregas</h2>
      {error ? <p className="text-red-700 text-sm">No se pudo cargar el historial.</p> : null}
      {rows?.length === 0 ? <p className="text-zinc-500 text-sm">Sin entregas registradas.</p> : null}
      {rows?.map(row => <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 p-3 text-sm">
        <span className="min-w-0">{new Date(row.received_at).toLocaleString('es-ES')} {row.note ? '· ' + row.note : ''}</span>
        <strong className="shrink-0">{Number(row.quantity_kg).toLocaleString('es-ES')} kg</strong>
      </div>)}
    </section>
  </main>
}
