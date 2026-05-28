'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  ChevronDown,
  Copy,
  Loader2,
  Minus,
  Plus,
  Save,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import {
  createEventAction,
  setEventActiveAction,
  updateDefaultPackAction,
  upsertEventProductAvailabilityAction,
} from './actions'

export type AdminMenuProductRow = {
  productId: string
  articulo_id: number
  name: string
  price: number
  category: string
  isActive: boolean
}

export type AdminEventRow = {
  id: string
  slug: string
  name: string
  event_date: string
  event_time: string
  description: string | null
  is_active: boolean
  created_at: string
  orders_count: number
}

type DefaultPackRow = { id: string; label: string; items: Array<{ product_id: string; quantity: number }> }

type Tab = 'eventos' | 'ajustes'

function formatEur(value: number): string {
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value)
  } catch {
    return `${value.toFixed(2)} €`
  }
}

function toHm(time: string): string {
  const t = String(time ?? '').trim()
  const m = t.match(/^(\d{2}):(\d{2})/)
  if (!m) return t
  return `${m[1]}:${m[2]}`
}

function safeClipboardCopy(text: string) {
  if (typeof navigator === 'undefined') return
  void navigator.clipboard
    ?.writeText(text)
    .then(() => toast.success('Enlace copiado'))
    .catch(() => toast.error('No se pudo copiar el enlace'))
}

function getCategoryLabel(p: AdminMenuProductRow): string {
  const c = String(p.category ?? '').trim()
  return c || 'Sin categoría'
}

const DEFAULT_PACK_FALLBACK_LABEL = 'Consumición tipo'

function QtyStepper({
  qty,
  onDec,
  onInc,
}: {
  qty: number
  onDec: () => void
  onInc: () => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        className="flex min-h-12 min-w-[48px] shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 active:opacity-80"
        aria-label="Restar"
        onClick={onDec}
      >
        <Minus className="h-5 w-5" strokeWidth={2.5} />
      </button>
      <div className="flex min-h-12 min-w-[56px] shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-sm font-black text-zinc-900">
        {qty === 0 ? ' ' : qty}
      </div>
      <button
        type="button"
        className="flex min-h-12 min-w-[48px] shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 active:opacity-80"
        aria-label="Sumar"
        onClick={onInc}
      >
        <Plus className="h-5 w-5" strokeWidth={2.5} />
      </button>
    </div>
  )
}

export default function EventosAdminClient({
  products,
  defaultPack,
  events,
  canManage = true,
}: {
  products: AdminMenuProductRow[]
  defaultPack: DefaultPackRow | null
  events: AdminEventRow[]
  canManage?: boolean
}) {
  const [tab, setTab] = useState<Tab>('eventos')
  const [showCreate, setShowCreate] = useState(false)
  const [ajustesPackOpen, setAjustesPackOpen] = useState(true)
  const [ajustesProductsOpen, setAjustesProductsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const activeProducts = useMemo(() => products.filter((p) => p.isActive), [products])

  const [packLabel, setPackLabel] = useState<string>(defaultPack?.label || DEFAULT_PACK_FALLBACK_LABEL)
  const [packQtyById, setPackQtyById] = useState<Record<string, number>>(() => {
    const out: Record<string, number> = {}
    for (const it of defaultPack?.items ?? []) {
      out[String(it.product_id)] = Number(it.quantity) || 0
    }
    return out
  })

  const [evName, setEvName] = useState('')
  const [evDate, setEvDate] = useState('')
  const [evTime, setEvTime] = useState('10:00')
  const [evDesc, setEvDesc] = useState('')

  const cardClass = 'rounded-xl border border-zinc-100 bg-white shadow-sm'
  const headerPill = 'text-[11px] font-black uppercase tracking-widest text-[#36606F]'
  const btnBase =
    'min-h-12 rounded-xl px-4 text-[12px] font-black uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

  const packSummary = useMemo(() => {
    const parts = products
      .filter((p) => (packQtyById[p.productId] ?? 0) > 0)
      .map((p) => `${p.name} ×${packQtyById[p.productId]}`)
    return parts.length ? parts.join(' · ') : ' '
  }, [products, packQtyById])

  const canCreate = Boolean(evName.trim() && evDate.trim() && evTime.trim() && !isPending)

  return (
    <div className="space-y-4">
      <div className={cn(cardClass, 'p-4')}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className={headerPill}>Encargos</p>
            <p className="mt-1 text-sm font-bold text-zinc-800">
              {tab === 'eventos'
                ? `${events.length} evento${events.length === 1 ? '' : 's'}`
                : `${activeProducts.length} productos activos en carta`}
            </p>
          </div>
          {canManage ? (
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setTab('eventos')
                  setShowCreate(false)
                }}
                className={cn(
                  btnBase,
                  tab === 'eventos' ? 'bg-[#36606F] text-white' : 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200'
                )}
              >
                Eventos
              </button>
              <button
                type="button"
                onClick={() => setTab('ajustes')}
                className={cn(
                  btnBase,
                  tab === 'ajustes' ? 'bg-[#36606F] text-white' : 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200'
                )}
              >
                Ajustes
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {tab === 'eventos' || !canManage ? (
        <>
          {canManage ? (
            <div className="flex justify-end">
              <button
                type="button"
                className={cn(
                  btnBase,
                  'inline-flex items-center gap-2',
                  showCreate ? 'bg-zinc-200 text-zinc-800' : 'bg-emerald-600 text-white hover:bg-emerald-700'
                )}
                onClick={() => setShowCreate((v) => !v)}
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                {showCreate ? 'Cerrar' : 'Nuevo evento'}
              </button>
            </div>
          ) : null}

          {canManage && showCreate ? (
            <div className={cn(cardClass, 'p-4')}>
              <p className={headerPill}>Nuevo evento</p>
              <p className="mt-1 text-xs text-zinc-600">
                Usa el pack y los productos activos de Ajustes. La carta pública será igual que la carta digital.
              </p>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-zinc-700">Nombre</label>
                  <input
                    value={evName}
                    onChange={(e) => setEvName(e.target.value)}
                    className="mt-2 min-h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-[#36606F]/25"
                    placeholder="Torneo handbol"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-zinc-700">Fecha</label>
                    <input
                      type="date"
                      value={evDate}
                      onChange={(e) => setEvDate(e.target.value)}
                      className="mt-2 min-h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-[#36606F]/25"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider text-zinc-700">Hora</label>
                    <input
                      type="time"
                      value={evTime}
                      onChange={(e) => setEvTime(e.target.value)}
                      className="mt-2 min-h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-[#36606F]/25"
                    />
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-black uppercase tracking-wider text-zinc-700">
                    Nota (opcional)
                  </label>
                  <input
                    value={evDesc}
                    onChange={(e) => setEvDesc(e.target.value)}
                    className="mt-2 min-h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-[#36606F]/25"
                    placeholder="Visible en el formulario del grupo"
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className={cn(btnBase, 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200')}
                  onClick={() => setShowCreate(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={cn(btnBase, 'inline-flex items-center gap-2 bg-[#36606F] text-white hover:bg-[#2a4a56]')}
                  disabled={!canCreate}
                  onClick={() => {
                    startTransition(async () => {
                      const res = await createEventAction({
                        name: evName,
                        event_date: evDate,
                        event_time: evTime,
                        description: evDesc,
                        pack_mode: 'default',
                        pack_items: null,
                        products_mode: 'global',
                        enabled_product_ids: null,
                      })
                      if (!res.success) {
                        toast.error(res.message)
                        return
                      }
                      toast.success('Evento creado')
                      setShowCreate(false)
                      setEvName('')
                      setEvDate('')
                      setEvDesc('')
                      setEvTime('10:00')
                    })
                  }}
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Crear evento
                </button>
              </div>
            </div>
          ) : null}

          <div className={cn(cardClass, 'p-4')}>
            {events.length === 0 ? (
              <p className="py-6 text-center text-sm font-bold text-zinc-600">
                {canManage ? 'Pulsa «Nuevo evento» para empezar.' : 'No hay eventos.'}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {events.map((e) => {
                  const publicUrl = `/eventos/${e.slug}`
                  const fullUrl =
                    typeof window !== 'undefined' ? `${window.location.origin}${publicUrl}` : publicUrl

                  return (
                    <div key={e.id} className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-black text-zinc-900">{e.name}</p>
                          <p className="mt-1 text-xs text-zinc-600">
                            {e.event_date} · {toHm(e.event_time)}h
                            {e.orders_count > 0 ? (
                              <>
                                {' '}
                                · {e.orders_count} pedido{e.orders_count === 1 ? '' : 's'}
                              </>
                            ) : null}
                          </p>
                        </div>
                        {canManage ? (
                          <button
                            type="button"
                            className={cn(
                              'flex min-h-12 min-w-[48px] shrink-0 items-center justify-center rounded-xl border px-3 transition-colors',
                              e.is_active
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-zinc-200 bg-white text-zinc-500'
                            )}
                            aria-label={e.is_active ? 'Desactivar' : 'Activar'}
                            onClick={() => {
                              startTransition(async () => {
                                const res = await setEventActiveAction({
                                  eventId: e.id,
                                  isActive: !e.is_active,
                                })
                                if (!res.success) toast.error(res.message)
                              })
                            }}
                          >
                            {e.is_active ? (
                              <ToggleRight className="h-6 w-6" strokeWidth={2.5} />
                            ) : (
                              <ToggleLeft className="h-6 w-6" strokeWidth={2.5} />
                            )}
                          </button>
                        ) : (
                          <span
                            className={cn(
                              'flex min-h-12 shrink-0 items-center rounded-xl border px-3 text-[11px] font-black uppercase',
                              e.is_active
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-zinc-200 bg-white text-zinc-500'
                            )}
                          >
                            {e.is_active ? 'Activo' : 'Off'}
                          </span>
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link
                          href={`/dashboard/eventos/${e.id}/pedidos`}
                          className={cn(
                            btnBase,
                            'inline-flex flex-1 items-center justify-center bg-[#36606F] text-white hover:bg-[#2a4a56] sm:flex-none'
                          )}
                        >
                          Pedidos
                        </Link>
                        <button
                          type="button"
                          className={cn(
                            btnBase,
                            'inline-flex flex-1 items-center justify-center gap-2 bg-zinc-100 text-zinc-800 hover:bg-zinc-200 sm:flex-none'
                          )}
                          onClick={() => safeClipboardCopy(fullUrl)}
                        >
                          <Copy className="h-4 w-4" strokeWidth={2.5} />
                          Enlace
                        </button>
                        <Link
                          href={publicUrl}
                          target="_blank"
                          className={cn(
                            btnBase,
                            'inline-flex items-center justify-center bg-white text-[#36606F] ring-1 ring-[#36606F]/20 hover:bg-[#36606F]/5'
                          )}
                        >
                          Ver carta
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      ) : null}

      {canManage && tab === 'ajustes' ? (
        <div className="space-y-3">
          <section className={cn(cardClass, 'overflow-hidden')}>
            <button
              type="button"
              className="flex min-h-12 w-full items-center justify-between gap-3 p-4 text-left"
              onClick={() => setAjustesPackOpen((v) => !v)}
            >
              <div className="min-w-0">
                <p className={headerPill}>Pack por defecto</p>
                <p className="mt-1 truncate text-xs text-zinc-600">{packSummary}</p>
              </div>
              <ChevronDown
                className={cn('h-5 w-5 shrink-0 text-zinc-500 transition-transform', ajustesPackOpen && 'rotate-180')}
              />
            </button>

            {ajustesPackOpen ? (
              <div className="border-t border-zinc-100 px-4 pb-4">
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <label className="block text-xs font-black uppercase tracking-wider text-zinc-700">
                      Nombre del pack
                    </label>
                    <input
                      value={packLabel}
                      onChange={(e) => setPackLabel(e.target.value)}
                      className="mt-2 min-h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-[#36606F]/25"
                    />
                  </div>
                  <button
                    type="button"
                    className={cn(btnBase, 'inline-flex shrink-0 items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700')}
                    onClick={() => {
                      startTransition(async () => {
                        const res = await updateDefaultPackAction({
                          label: packLabel.trim() || DEFAULT_PACK_FALLBACK_LABEL,
                          items: Object.entries(packQtyById).map(([product_id, quantity]) => ({
                            product_id,
                            quantity,
                          })),
                        })
                        if (!res.success) toast.error(res.message)
                        else toast.success('Pack guardado')
                      })
                    }}
                  >
                    <Save className="h-4 w-4" strokeWidth={2.5} />
                    Guardar pack
                  </button>
                </div>

                <div className="mt-4 max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                  {activeProducts.map((p) => {
                    const qty = packQtyById[p.productId] ?? 0
                    return (
                      <div
                        key={p.productId}
                        className="flex items-center justify-between gap-3 rounded-xl border border-zinc-100 bg-white p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-zinc-900">{p.name}</p>
                          <p className="text-xs text-zinc-500">
                            {getCategoryLabel(p)} · {formatEur(Number(p.price) || 0)}
                          </p>
                        </div>
                        <QtyStepper
                          qty={qty}
                          onDec={() =>
                            setPackQtyById((curr) => ({
                              ...curr,
                              [p.productId]: Math.max(0, (curr[p.productId] ?? 0) - 1),
                            }))
                          }
                          onInc={() =>
                            setPackQtyById((curr) => ({
                              ...curr,
                              [p.productId]: Math.min(999, (curr[p.productId] ?? 0) + 1),
                            }))
                          }
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </section>

          <section className={cn(cardClass, 'overflow-hidden')}>
            <button
              type="button"
              className="flex min-h-12 w-full items-center justify-between gap-3 p-4 text-left"
              onClick={() => setAjustesProductsOpen((v) => !v)}
            >
              <div className="min-w-0">
                <p className={headerPill}>Productos en la carta del encargo</p>
                <p className="mt-1 text-xs text-zinc-600">
                  {activeProducts.length} activos de {products.length} — solo los ON aparecen al pedir
                </p>
              </div>
              <ChevronDown
                className={cn(
                  'h-5 w-5 shrink-0 text-zinc-500 transition-transform',
                  ajustesProductsOpen && 'rotate-180'
                )}
              />
            </button>

            {ajustesProductsOpen ? (
              <div className="border-t border-zinc-100 px-4 pb-4">
                <div className="mt-3 max-h-[55vh] space-y-2 overflow-y-auto pr-1">
                  {products.map((p) => (
                    <div
                      key={p.productId}
                      className="flex items-center justify-between gap-3 rounded-xl border border-zinc-100 bg-white p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-zinc-900">{p.name}</p>
                        <p className="text-xs text-zinc-500">
                          {getCategoryLabel(p)} · {formatEur(Number(p.price) || 0)}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={cn(
                          'flex min-h-12 min-w-[48px] shrink-0 items-center justify-center rounded-xl border px-3',
                          p.isActive
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-zinc-200 bg-white text-zinc-500'
                        )}
                        aria-label={p.isActive ? 'Quitar de encargos' : 'Añadir a encargos'}
                        onClick={() => {
                          startTransition(async () => {
                            const res = await upsertEventProductAvailabilityAction({
                              productId: p.productId,
                              isActive: !p.isActive,
                            })
                            if (!res.success) toast.error(res.message)
                          })
                        }}
                      >
                        {p.isActive ? (
                          <ToggleRight className="h-6 w-6" strokeWidth={2.5} />
                        ) : (
                          <ToggleLeft className="h-6 w-6" strokeWidth={2.5} />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  )
}
