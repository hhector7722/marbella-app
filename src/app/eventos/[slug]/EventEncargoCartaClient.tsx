'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { PublicCarta, type PublicMenuRow } from '@/components/public/PublicCarta'
import {
  eventOrderProductId,
  type EventOrderCartaControl,
} from '@/lib/event-order-carta'
import type { MenuCategoryCatalogEntry } from '@/lib/carta-plato-marbella'
import type { CartaPhotoScale } from '@/lib/carta-product-photo'
import { cn } from '@/lib/utils'
import { saveEventPackAction } from '@/app/dashboard/eventos/actions'
import { submitEventOrderAction } from './actions'

export type EncargoCartaEvent = {
  id: string
  slug: string
  name: string
  event_date: string
  event_time: string
}

type PackItem = { product_id: string; quantity: number }

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

function sumTotal(menuItems: PublicMenuRow[], qtyById: Record<string, number>): number {
  const priceById = new Map(menuItems.map((p) => [eventOrderProductId(p.articulo_id), Number(p.precio) || 0]))
  let total = 0
  for (const [pid, qtyRaw] of Object.entries(qtyById)) {
    const qty = Math.max(0, Number(qtyRaw) || 0)
    if (qty <= 0) continue
    total += (priceById.get(pid) ?? 0) * qty
  }
  return total
}

export default function EventEncargoCartaClient({
  mode,
  event,
  menuItems,
  menuCategories,
  categoryCoverById,
  categoryCoverScaleById,
  startingPackItems,
  backHref = null,
}: {
  mode: 'manage' | 'order'
  event: EncargoCartaEvent
  menuItems: PublicMenuRow[]
  menuCategories: MenuCategoryCatalogEntry[]
  categoryCoverById: Record<string, string | null>
  categoryCoverScaleById: Record<string, CartaPhotoScale>
  startingPackItems: PackItem[]
  backHref?: string | null
}) {
  const [isPending, startTransition] = useTransition()
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
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [responsibleName, setResponsibleName] = useState('')
  const [orderDone, setOrderDone] = useState(false)

  const totalItems = useMemo(() => sumItems(qtyById), [qtyById])
  const totalAmount = useMemo(() => sumTotal(menuItems, qtyById), [menuItems, qtyById])

  const onQuantityChange = useCallback((articuloId: number, quantity: number) => {
    const pid = eventOrderProductId(articuloId)
    setQtyById((curr) => {
      const next = Math.max(0, Math.min(999, Number(quantity) || 0))
      if (next <= 0) {
        const { [pid]: _removed, ...rest } = curr
        return rest
      }
      return { ...curr, [pid]: next }
    })
  }, [])

  const eventOrder: EventOrderCartaControl = useMemo(
    () => ({ qtyByProductId: qtyById, onQuantityChange }),
    [qtyById, onQuantityChange]
  )

  const btnBase =
    'min-h-12 rounded-xl px-5 text-[12px] font-black uppercase tracking-wider transition-colors disabled:opacity-50'

  if (orderDone) {
    return (
      <main className="flex min-h-[100dvh] flex-col bg-white text-zinc-900">
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 pb-safe pt-safe md:px-8">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" strokeWidth={2.25} />
            <p className="mt-3 text-lg font-black text-zinc-900">Pedido enviado</p>
            <p className="mt-2 text-sm font-bold text-zinc-700">Gracias, {responsibleName}.</p>
          </div>
        </div>
      </main>
    )
  }

  const footer =
    mode === 'manage' ? (
      <div className="px-0 py-3">
        <button
          type="button"
          className={cn(btnBase, 'w-full bg-[#36606F] text-white hover:bg-[#2a4a56]')}
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              const items = Object.entries(qtyById)
                .map(([product_id, quantity]) => ({ product_id, quantity }))
                .filter((it) => Number(it.quantity) > 0)
              const res = await saveEventPackAction({ eventId: event.id, items })
              if (!res.success) {
                toast.error(res.message)
                return
              }
              toast.success('Encargo guardado')
            })
          }}
        >
          {isPending ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'Guardar encargo'}
        </button>
      </div>
    ) : (
      <div className="px-0 py-3">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <p className="text-sm font-black text-zinc-900">
            {totalItems === 0 ? ' ' : `${totalItems} uds.`}
            {totalItems > 0 ? ` · ${formatEur(totalAmount)}` : ''}
          </p>
        </div>
        <button
          type="button"
          className={cn(
            btnBase,
            'w-full',
            totalItems > 0 ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-zinc-200 text-zinc-600'
          )}
          disabled={totalItems <= 0 || isPending}
          onClick={() => setConfirmOpen(true)}
        >
          Confirmar pedido
        </button>
      </div>
    )

  return (
    <>
      <PublicCarta
        items={menuItems}
        menuCategories={menuCategories}
        categoryCoverById={categoryCoverById}
        categoryCoverScaleById={categoryCoverScaleById}
        backHref={backHref}
        cartaEditHref={null}
        eventOrder={eventOrder}
        footer={footer}
      />

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-label="Confirmar pedido"
          onClick={() => !isPending && setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[11px] font-black uppercase tracking-widest text-[#36606F]">Tu nombre</p>
            <p className="mt-1 text-xs text-zinc-600">Responsable del pedido del grupo</p>
            <input
              value={responsibleName}
              onChange={(e) => setResponsibleName(e.target.value)}
              className="mt-3 min-h-12 w-full rounded-xl border border-zinc-200 px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[#36606F]/25"
              placeholder="Nombre y apellidos"
              autoComplete="name"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className={cn(btnBase, 'flex-1 bg-zinc-100 text-zinc-800')}
                disabled={isPending}
                onClick={() => setConfirmOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={cn(btnBase, 'flex-1 bg-emerald-600 text-white')}
                disabled={isPending || responsibleName.trim().length < 2}
                onClick={() => {
                  const name = responsibleName.trim()
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
                    setConfirmOpen(false)
                    setOrderDone(true)
                  })
                }}
              >
                {isPending ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
