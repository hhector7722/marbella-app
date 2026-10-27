import { randomUUID } from 'node:crypto'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { recordPonsDelivery } from './actions'

export const dynamic='force-dynamic'

export default async function PonsPage({ searchParams }: {
  searchParams: Promise<{ok?:string;error?:string}>
}) {
  const supabase=await createClient()
  const {data:{user}}=await supabase.auth.getUser()
  if (!user) redirect('/login')
  const {data:profile}=await supabase.from('profiles').select('role')
    .eq('id',user.id).maybeSingle()
  if(profile?.role!=='manager' && profile?.role!=='admin')
    redirect('/dashboard/albaranes')
  const {data:rows,error}=await supabase.from('manual_pons_vermut_receipts')
    .select('id,quantity_l,received_at,note,stock_movement_id')
    .order('received_at',{ascending:false}).limit(20)
  const search=await searchParams
  return <main className="mx-auto max-w-xl space-y-5 px-4 py-5">
    <header className="flex items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">Pons · Vermut</h1>
      <p className="text-sm text-zinc-500">Entrada manual de mercancía</p></div>
      <Link href="/dashboard/albaranes" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm">Albaranes</Link>
    </header>
    <div className="rounded-lg border border-zinc-200 p-4 space-y-2">
      <p className="text-sm">Proveedor <strong>Pons</strong> · producto <strong>Vermut</strong>.</p>
      <p className="text-sm">Anota los <strong>litros realmente recibidos</strong>; si llega una garrafa, indica su capacidad. La entrada actualiza el inventario sin crear una factura ni suponer un precio.</p>
      <p className="text-xs text-zinc-500">El justificante o factura en papel podrá fotografiarse después. No registres esa misma entrega dos veces.</p>
    </div>
    {search.error?<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{search.error}</p>:null}
    {search.ok?<p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Vermut registrado en inventario.</p>:null}
    <form action={recordPonsDelivery} className="space-y-4 rounded-xl border border-zinc-200 p-4">
      <input type="hidden" name="requestId" value={randomUUID()}/>
      <label className="block text-sm font-medium">Litros recibidos
        <input type="number" min="0.001" max="200" step="0.001" required name="litros"
          placeholder="Ej. 10" className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white p-3 text-lg text-zinc-900"/>
      </label>
      <label className="block text-sm font-medium">Nota (opcional)
        <input name="note" maxLength={300} placeholder="Ej. una garrafa"
          className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white p-3 text-sm text-zinc-900"/>
      </label>
      <button type="submit" className="w-full rounded-lg bg-[#36606F] p-3 font-semibold text-white">Registrar Vermut de Pons</button>
    </form>
    <section className="space-y-2">
      <h2 className="font-semibold">Últimas entregas</h2>
      {error?<p className="text-sm text-red-700">No se pudo cargar el historial.</p>:null}
      {rows?.length===0?<p className="text-sm text-zinc-500">Aún no hay entregas.</p>:null}
      {rows?.map(r=><div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 p-3 text-sm">
        <span className="min-w-0">{new Date(r.received_at).toLocaleString('es-ES')}{r.note?' · '+r.note:''}</span>
        <strong className="shrink-0">{Number(r.quantity_l).toLocaleString('es-ES')} l</strong>
      </div>)}
    </section>
  </main>
}
