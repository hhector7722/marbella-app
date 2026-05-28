'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { CheckCircle2, Loader2, Minus, Plus } from 'lucide-react'
import { submitEventOrderAction } from './actions'

export type PublicEventRow = {
  id: string
  slug: string
  name: string
  event_date: string
  event_time: string
  description: string | null
}

export type PublicEventProductRow = {
  product_id: string
  name: string
  price: number
  category: string | null
}

type PackItem = { product_id: string; quantity: number }

type SuccessOrder = {
  id: string
  responsible_name: string
  items: Array<{ product_id: string; name: string; quantity: number; unit_price: number }>
  total_amount: number
  status: string
}

function formatEur(value: number): string {
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value)
  } catch {
    return `${value.toFixed(2)} €`
  }
}

function sumItems(qtyById: Record<string, number>): number {
  let n = 0
  for (const k of Object.keys(qtyById)) n += Math.max(0, Number(qtyById[k]) || 0)
  return n
}

function sumTotal(products: PublicEventProductRow[], qtyById: Record<string, number>): number {
  const priceById = new Map(products.map((p) => [p.product_id, Number(p.price) || 0]))
  let total = 0
  for (const [pid, qtyRaw] of Object.entries(qtyById)) {
    const qty = Math.max(0, Number(qtyRaw) || 0)
    if (qty <= 0) continue
    total += (priceById.get(pid) ?? 0) * qty
  }
  return total
}

export default function EventOrderFormClient({
  event,
  products,
  startingPackItems,
}: {
  event: PublicEventRow
  products: PublicEventProductRow[]
  startingPackItems: PackItem[]
}) {
  const [isPending, startTransition] = useTransition()
  const [step, setStep] = useState<'form' | 'success'>('form')
  const [responsibleName, setResponsibleName] = useState('')
  const [qtyById, setQtyById] = useState<Record<string, number>>(() => {
    const out: Record<string, number> = {}
    for (const it of startingPackItems ?? []) {
      const pid = String(it.product_id ?? '').trim()
      const qty = Number(it.quantity) || 0
      if (!pid || qty <= 0) continue
      out[pid] = qty
    }
    return out
  })
  const [createdOrder, setCreatedOrder] = useState<SuccessOrder | null>(null)

  const totalItems = useMemo(() => sumItems(qtyById), [qtyById])
  const totalAmount = useMemo(() => sumTotal(products, qtyById), [products, qtyById])
  const canSubmit = responsibleName.trim().length >= 2 && totalItems > 0 && !isPending

  const cardClass = 'rounded-xl border border-zinc-100 bg-white shadow-sm'
  const headerPill = 'text-[11px] font-black uppercase tracking-widest text-[#36606F]'

  if (step === 'success' && createdOrder) {
    return (
      <div className={cn(cardClass, 'p-5')}>
        <div className="flex items-start gap-3">
          <div className="shrink-0">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" strokeWidth={2.25} />
          </div>
          <div className="min-w-0 flex-1">
            <p className={headerPill}>Pedido confirmado</p>
            <p className="mt-1 text-lg font-black text-zinc-900">Gracias, {createdOrder.responsible_name}.</p>
            <p className="mt-2 text-sm font-bold text-zinc-700">
              {totalItems === 0 ? ' ' : `${totalItems} items`} · {formatEur(createdOrder.total_amount)}
            </p>
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-black uppercase tracking-wider text-emerald-800">Resumen</p>
              <ul className="mt-2 space-y-1">
                {createdOrder.items.map((it) => (
                  <li key={it.product_id} className="text-sm font-bold text-emerald-900">
                    {it.name} ×{it.quantity}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-28">
      <div className={cn(cardClass, 'p-4')}>
        <p className={headerPill}>Identificación</p>
        <label className="mt-2 block text-xs font-black uppercase tracking-wider text-zinc-700">
          Nombre del responsable del pedido
        </label>
        <input
          value={responsibleName}
          onChange={(e) => setResponsibleName(e.target.value)}
          className="mt-2 min-h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-[#36606F]/25"
          placeholder="Tu nombre"
          autoComplete="name"
        />
      </div>

      <div className="mt-4 space-y-2">
        <div className={cn(cardClass, 'p-4')}>
          <p className={headerPill}>Productos</p>
          <p className="mt-1 text-xs text-zinc-600">Ajusta cantidades con +/−.</p>
        </div>

        {products.map((p) => {
          const qty = qtyById[p.product_id] ?? 0
          return (
            <div key={p.product_id} className={cn(cardClass, 'p-4')}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-zinc-900">{p.name}</p>
                  <p className="mt-0.5 text-xs text-zinc-600">
                    {p.category ? `${p.category} · ` : ''}
                    {formatEur(Number(p.price) || 0)}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <button
                    type="button"
                    className="min-h-12 min-w-[48px] shrink-0 rounded-xl border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 active:opacity-80 flex items-center justify-center"
                    aria-label="Restar"
                    onClick={() =>
                      setQtyById((curr) => ({
                        ...curr,
                        [p.product_id]: Math.max(0, (curr[p.product_id] ?? 0) - 1),
                      }))
                    }
                  >
                    <Minus className="h-5 w-5" strokeWidth={2.5} />
                  </button>
                  <div className="min-h-12 min-w-[56px] shrink-0 rounded-xl border border-zinc-200 bg-zinc-50 flex items-center justify-center text-sm font-black text-zinc-900">
                    {qty === 0 ? ' ' : qty}
                  </div>
                  <button
                    type="button"
                    className="min-h-12 min-w-[48px] shrink-0 rounded-xl border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 active:opacity-80 flex items-center justify-center"
                    aria-label="Sumar"
                    onClick={() =>
                      setQtyById((curr) => ({
                        ...curr,
                        [p.product_id]: Math.min(999, (curr[p.product_id] ?? 0) + 1),
                      }))
                    }
                  >
                    <Plus className="h-5 w-5" strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 bg-white/95 backdrop-blur border-t border-zinc-200 pb-safe">
        <div className="mx-auto w-full max-w-2xl px-5 md:px-8">
          <div className="py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-zinc-900">
                  {totalItems === 0 ? ' ' : `${totalItems} items`} · {totalItems === 0 ? ' ' : formatEur(totalAmount)}
                </p>
                <p className="text-[11px] font-bold text-zinc-600 truncate">{event.name}</p>
              </div>
              <button
                type="button"
                className={cn(
                  'min-h-14 shrink-0 rounded-xl px-5 text-[12px] font-black uppercase tracking-wider transition-colors flex items-center gap-2',
                  canSubmit ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-zinc-200 text-zinc-600'
                )}
                disabled={!canSubmit}
                onClick={() => {
                  const name = responsibleName.trim()
                  if (!name) {
                    toast.error('Nombre del responsable requerido.')
                    return
                  }
                  if (totalItems <= 0) {
                    toast.error('Debes pedir al menos 1 item.')
                    return
                  }
                  startTransition(async () => {
                    const items = Object.entries(qtyById)
                      .map(([product_id, quantity]) => ({ product_id, quantity }))
                      .filter((it) => Number(it.quantity) > 0)
                    const res = await submitEventOrderAction({
                      slug: event.slug,
                      responsible_name: name,
                      items,
                    })
                    if (!res.success) {
                      toast.error(res.message)
                      return
                    }
                    setCreatedOrder(res.order)
                    setStep('success')
                  })
                }}
                aria-label="Confirmar pedido"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Confirmar pedido
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

