'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { CheckCircle2 } from 'lucide-react'
import { CartaLangPicker } from '@/components/carta/CartaLangPicker'
import {
  publicMenuRowsToDigitalMenu,
  type PublicMenuRow,
} from '@/components/public/PublicCarta'
import { MenuAccordion } from '@/components/staff/MenuAccordion'
import { DEFAULT_CARTA_LANG, type CartaLang } from '@/lib/carta-menu-i18n'
import {
  eventOrderProductId,
  type EventOrderCartaControl,
} from '@/lib/event-order-carta'
import type { MenuCategoryCatalogEntry } from '@/lib/carta-plato-marbella'
import type { CartaPhotoScale } from '@/lib/carta-product-photo'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { submitEventOrderAction } from './actions'

export type PublicEventRow = {
  id: string
  slug: string
  name: string
  event_date: string
  event_time: string
  description: string | null
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

export default function EventOrderFormClient({
  event,
  menuItems,
  menuCategories,
  categoryCoverById,
  categoryCoverScaleById,
  startingPackItems,
}: {
  event: PublicEventRow
  menuItems: PublicMenuRow[]
  menuCategories: MenuCategoryCatalogEntry[]
  categoryCoverById: Record<string, string | null>
  categoryCoverScaleById: Record<string, CartaPhotoScale>
  startingPackItems: PackItem[]
}) {
  const [isPending, startTransition] = useTransition()
  const [step, setStep] = useState<'form' | 'success'>('form')
  const [lang, setLang] = useState<CartaLang>(DEFAULT_CARTA_LANG)
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

  const digitalItems = useMemo(() => publicMenuRowsToDigitalMenu(menuItems), [menuItems])
  const totalItems = useMemo(() => sumItems(qtyById), [qtyById])
  const totalAmount = useMemo(() => sumTotal(menuItems, qtyById), [menuItems, qtyById])
  const canSubmit = responsibleName.trim().length >= 2 && totalItems > 0 && !isPending

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
    () => ({
      qtyByProductId: qtyById,
      onQuantityChange,
    }),
    [qtyById, onQuantityChange]
  )

  const cardClass = 'rounded-xl border border-zinc-100 bg-white shadow-sm'
  const headerPill = 'text-[11px] font-black uppercase tracking-widest text-[#36606F]'

  if (step === 'success' && createdOrder) {
    return (
      <div className={cn(cardClass, 'p-5')}>
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-8 w-8 shrink-0 text-emerald-600" strokeWidth={2.25} />
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
    <div className="flex min-h-0 flex-1 flex-col pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <div className={cn(cardClass, 'shrink-0 p-4')}>
        <p className={headerPill}>Responsable del pedido</p>
        <input
          value={responsibleName}
          onChange={(e) => setResponsibleName(e.target.value)}
          className="mt-2 min-h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-[#36606F]/25"
          placeholder="Tu nombre"
          autoComplete="name"
        />
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-sm">
        <div className="shrink-0 border-b border-zinc-100 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className={headerPill}>Carta del evento</p>
            <CartaLangPicker lang={lang} onChange={setLang} layout="spread" compact />
          </div>
          <p className="mt-1 text-xs font-medium text-zinc-500">
            Misma carta que en el local. Ajusta cantidades con +/− en cada producto.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar pb-28">
          <MenuAccordion
            items={digitalItems}
            lang={lang}
            onLangChange={setLang}
            hideLangPicker
            menuCategories={menuCategories}
            categoryCoverById={categoryCoverById}
            categoryCoverScaleById={categoryCoverScaleById}
            homeCompact
            eventOrder={eventOrder}
          />
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 pb-safe backdrop-blur">
        <div className="mx-auto w-full max-w-2xl px-5 md:px-8">
          <div className="py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-zinc-900">
                  {totalItems === 0 ? ' ' : `${totalItems} items`} ·{' '}
                  {totalItems === 0 ? ' ' : formatEur(totalAmount)}
                </p>
                <p className="truncate text-[11px] font-bold text-zinc-600">{event.name}</p>
              </div>
              <Button
                type="button"
                variant="primary"
                instance="event-order-confirm"
                className="shrink-0"
                disabled={!canSubmit}
                loading={isPending}
                loadingLabel="Confirmar pedido"
                aria-label="Confirmar pedido"
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
              >
                Confirmar pedido
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
