'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Copy,
  ExternalLink,
  Loader2,
  Minus,
  Plus,
  Save,
  Settings2,
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
  event_date: string // YYYY-MM-DD
  event_time: string // HH:mm:ss
  description: string | null
  is_active: boolean
  created_at: string
  orders_count: number
}

type DefaultPackRow = { id: string; label: string; items: Array<{ product_id: string; quantity: number }> }

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
    .then(() => toast.success('URL copiada'))
    .catch(() => toast.error('No se pudo copiar la URL'))
}

function getCategoryLabel(p: AdminMenuProductRow): string {
  const c = String(p.category ?? '').trim()
  return c || 'Sin categoría'
}

const DEFAULT_PACK_FALLBACK_LABEL = 'Consumición tipo'

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
  const [tab, setTab] = useState<'productos' | 'pack' | 'crear' | 'lista'>('lista')
  const [isPending, startTransition] = useTransition()

  const activeProducts = useMemo(() => products.filter((p) => p.isActive), [products])

  // Default pack editor state
  const [packLabel, setPackLabel] = useState<string>(defaultPack?.label || DEFAULT_PACK_FALLBACK_LABEL)
  const [packQtyById, setPackQtyById] = useState<Record<string, number>>(() => {
    const out: Record<string, number> = {}
    for (const it of defaultPack?.items ?? []) {
      out[String(it.product_id)] = Number(it.quantity) || 0
    }
    return out
  })

  // Create event form state
  const [evName, setEvName] = useState('')
  const [evDate, setEvDate] = useState('')
  const [evTime, setEvTime] = useState('10:00')
  const [evDesc, setEvDesc] = useState('')
  const [packMode, setPackMode] = useState<'default' | 'custom'>('default')
  const [productsMode, setProductsMode] = useState<'global' | 'custom'>('global')
  const [customEnabledSet, setCustomEnabledSet] = useState<Record<string, boolean>>({})
  const [customPackQtyById, setCustomPackQtyById] = useState<Record<string, number>>({})

  const cardClass = 'rounded-xl border border-zinc-100 bg-white shadow-sm'
  const headerPill = 'text-[11px] font-black uppercase tracking-widest text-[#36606F]'
  const btnBase =
    'min-h-12 rounded-xl px-4 text-[12px] font-black uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

  const packItems = useMemo(
    () =>
      products
        .map((p) => ({ ...p, quantity: packQtyById[p.productId] ?? 0 }))
        .filter((p) => (packQtyById[p.productId] ?? 0) > 0),
    [products, packQtyById]
  )

  const customPackItems = useMemo(
    () =>
      products
        .map((p) => ({ ...p, quantity: customPackQtyById[p.productId] ?? 0 }))
        .filter((p) => (customPackQtyById[p.productId] ?? 0) > 0),
    [products, customPackQtyById]
  )

  const customEnabledIds = useMemo(() => {
    const ids = Object.entries(customEnabledSet)
      .filter(([, v]) => v)
      .map(([k]) => k)
    return Array.from(new Set(ids))
  }, [customEnabledSet])

  return (
    <div className="space-y-6">
      <div className={cn(cardClass, 'p-4')}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className={headerPill}>Panel de eventos</p>
            <p className="mt-1 text-sm font-bold text-zinc-800">
              Productos: {products.length} · Activos: {activeProducts.length} · Eventos: {events.length}
            </p>
          </div>
          {canManage ? (
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setTab('lista')}
                className={cn(btnBase, tab === 'lista' ? 'bg-[#36606F] text-white' : 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200')}
              >
                Eventos
              </button>
              <button
                type="button"
                onClick={() => setTab('crear')}
                className={cn(btnBase, tab === 'crear' ? 'bg-[#36606F] text-white' : 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200')}
              >
                Crear
              </button>
              <button
                type="button"
                onClick={() => setTab('productos')}
                className={cn(btnBase, tab === 'productos' ? 'bg-[#36606F] text-white' : 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200')}
              >
                Productos
              </button>
              <button
                type="button"
                onClick={() => setTab('pack')}
                className={cn(btnBase, tab === 'pack' ? 'bg-[#36606F] text-white' : 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200')}
              >
                Pack
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {canManage && tab === 'productos' ? (
        <div className={cn(cardClass, 'p-4')}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className={headerPill}>Productos disponibles para eventos</p>
              <p className="mt-1 text-xs text-zinc-600">
                Toggle ON/OFF guarda en <span className="font-mono">event_products</span> (sin borrar).
              </p>
            </div>
            <div className="shrink-0 flex items-center gap-2 text-xs text-zinc-600">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
            {products.map((p) => (
              <div key={p.productId} className="rounded-xl border border-zinc-100 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-zinc-900">{p.name}</p>
                    <p className="mt-0.5 text-xs text-zinc-600">
                      {getCategoryLabel(p)} · {formatEur(Number(p.price) || 0)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={cn(
                      'min-h-12 min-w-[48px] shrink-0 rounded-xl border px-3 flex items-center justify-center transition-colors',
                      p.isActive
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                    )}
                    aria-label={p.isActive ? 'Desactivar producto' : 'Activar producto'}
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
                    {p.isActive ? <ToggleRight className="h-6 w-6" strokeWidth={2.5} /> : <ToggleLeft className="h-6 w-6" strokeWidth={2.5} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {canManage && tab === 'pack' ? (
        <div className={cn(cardClass, 'p-4')}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={headerPill}>Pack por defecto</p>
              <p className="mt-1 text-xs text-zinc-600">Define la “consumición tipo” base para eventos.</p>
            </div>
            <button
              type="button"
              className={cn(btnBase, 'shrink-0 bg-emerald-600 text-white hover:bg-emerald-700')}
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
              Guardar
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-100 bg-white p-3 shadow-sm">
              <label className="block text-xs font-black uppercase tracking-wider text-zinc-700">Etiqueta</label>
              <input
                value={packLabel}
                onChange={(e) => setPackLabel(e.target.value)}
                className="mt-2 min-h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-[#36606F]/25"
                placeholder="Consumición tipo"
              />
              <div className="mt-3 text-xs text-zinc-600">
                Incluye: {packItems.length === 0 ? ' ' : packItems.map((x) => `${x.name} ×${x.quantity}`).join(' · ')}
              </div>
            </div>

            <div className="rounded-xl border border-zinc-100 bg-white p-3 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wider text-zinc-700">Editor de cantidades</p>
              <p className="mt-1 text-xs text-zinc-600">
                Solo se guardan items con cantidad &gt; 0. En lectura, 0 se muestra como “ ”.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
            {activeProducts.map((p) => {
              const qty = packQtyById[p.productId] ?? 0
              return (
                <div key={p.productId} className="rounded-xl border border-zinc-100 bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-zinc-900">{p.name}</p>
                      <p className="mt-0.5 text-xs text-zinc-600">
                        {getCategoryLabel(p)} · {formatEur(Number(p.price) || 0)}
                      </p>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <button
                        type="button"
                        className="min-h-12 min-w-[48px] shrink-0 rounded-xl border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 active:opacity-80 flex items-center justify-center"
                        aria-label="Restar"
                        onClick={() => setPackQtyById((curr) => ({ ...curr, [p.productId]: Math.max(0, (curr[p.productId] ?? 0) - 1) }))}
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
                        onClick={() => setPackQtyById((curr) => ({ ...curr, [p.productId]: Math.min(999, (curr[p.productId] ?? 0) + 1) }))}
                      >
                        <Plus className="h-5 w-5" strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {canManage && tab === 'crear' ? (
        <div className={cn(cardClass, 'p-4')}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={headerPill}>Crear evento</p>
              <p className="mt-1 text-xs text-zinc-600">
                Slug automático: <span className="font-mono">slugify(name)-YYYY-MM-DD-xxxx</span>
              </p>
            </div>
            <button
              type="button"
              className={cn(btnBase, 'shrink-0 bg-emerald-600 text-white hover:bg-emerald-700')}
              onClick={() => {
                startTransition(async () => {
                  const res = await createEventAction({
                    name: evName,
                    event_date: evDate,
                    event_time: evTime,
                    description: evDesc,
                    pack_mode: packMode,
                    pack_items:
                      packMode === 'custom'
                        ? Object.entries(customPackQtyById).map(([product_id, quantity]) => ({
                            product_id,
                            quantity,
                          }))
                        : null,
                    products_mode: productsMode,
                    enabled_product_ids: productsMode === 'custom' ? customEnabledIds : null,
                  })
                  if (!res.success) {
                    toast.error(res.message)
                    return
                  }
                  toast.success('Evento creado')
                  setTab('lista')
                  setEvName('')
                  setEvDate('')
                  setEvDesc('')
                  setPackMode('default')
                  setProductsMode('global')
                  setCustomEnabledSet({})
                  setCustomPackQtyById({})
                })
              }}
              disabled={!evName.trim() || !evDate.trim() || !evTime.trim()}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" strokeWidth={2.5} />}
              Crear
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-100 bg-white p-3 shadow-sm">
              <label className="block text-xs font-black uppercase tracking-wider text-zinc-700">Nombre</label>
              <input
                value={evName}
                onChange={(e) => setEvName(e.target.value)}
                className="mt-2 min-h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-[#36606F]/25"
                placeholder="Torneo Handbol"
              />
              <div className="mt-3 grid grid-cols-2 gap-2">
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
            </div>

            <div className="rounded-xl border border-zinc-100 bg-white p-3 shadow-sm">
              <label className="block text-xs font-black uppercase tracking-wider text-zinc-700">Descripción (opcional)</label>
              <textarea
                value={evDesc}
                onChange={(e) => setEvDesc(e.target.value)}
                className="mt-2 min-h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm font-semibold text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-[#36606F]/25"
                rows={4}
                placeholder="Notas internas del evento…"
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-100 bg-white p-3 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wider text-zinc-700">Pack</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className={cn(
                    btnBase,
                    'flex-1',
                    packMode === 'default' ? 'bg-[#36606F] text-white' : 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200'
                  )}
                  onClick={() => setPackMode('default')}
                >
                  Usar default
                </button>
                <button
                  type="button"
                  className={cn(
                    btnBase,
                    'flex-1',
                    packMode === 'custom' ? 'bg-[#36606F] text-white' : 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200'
                  )}
                  onClick={() => setPackMode('custom')}
                >
                  Personalizar
                </button>
              </div>

              {packMode === 'custom' ? (
                <div className="mt-3 space-y-2">
                  {activeProducts.slice(0, 12).map((p) => {
                    const qty = customPackQtyById[p.productId] ?? 0
                    return (
                      <div key={p.productId} className="flex items-center justify-between gap-2">
                        <p className="min-w-0 flex-1 truncate text-xs font-bold text-zinc-800">{p.name}</p>
                        <div className="shrink-0 flex items-center gap-2">
                          <button
                            type="button"
                            className="min-h-12 min-w-[48px] shrink-0 rounded-xl border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 flex items-center justify-center"
                            onClick={() =>
                              setCustomPackQtyById((curr) => ({
                                ...curr,
                                [p.productId]: Math.max(0, (curr[p.productId] ?? 0) - 1),
                              }))
                            }
                            aria-label="Restar"
                          >
                            <Minus className="h-5 w-5" strokeWidth={2.5} />
                          </button>
                          <div className="min-h-12 min-w-[56px] shrink-0 rounded-xl border border-zinc-200 bg-zinc-50 flex items-center justify-center text-sm font-black text-zinc-900">
                            {qty === 0 ? ' ' : qty}
                          </div>
                          <button
                            type="button"
                            className="min-h-12 min-w-[48px] shrink-0 rounded-xl border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 flex items-center justify-center"
                            onClick={() =>
                              setCustomPackQtyById((curr) => ({
                                ...curr,
                                [p.productId]: Math.min(999, (curr[p.productId] ?? 0) + 1),
                              }))
                            }
                            aria-label="Sumar"
                          >
                            <Plus className="h-5 w-5" strokeWidth={2.5} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  <p className="text-[11px] text-zinc-600">
                    Pack personalizado actual: {customPackItems.length === 0 ? ' ' : customPackItems.map((x) => `${x.name} ×${x.quantity}`).join(' · ')}
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-xs text-zinc-600">
                  Se usará el pack por defecto ({(defaultPack?.label ?? DEFAULT_PACK_FALLBACK_LABEL).trim() || DEFAULT_PACK_FALLBACK_LABEL}).
                </p>
              )}
            </div>

            <div className="rounded-xl border border-zinc-100 bg-white p-3 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wider text-zinc-700">Productos del evento</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className={cn(
                    btnBase,
                    'flex-1',
                    productsMode === 'global' ? 'bg-[#36606F] text-white' : 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200'
                  )}
                  onClick={() => setProductsMode('global')}
                >
                  Global activos
                </button>
                <button
                  type="button"
                  className={cn(
                    btnBase,
                    'flex-1',
                    productsMode === 'custom' ? 'bg-[#36606F] text-white' : 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200'
                  )}
                  onClick={() => setProductsMode('custom')}
                >
                  Personalizar
                </button>
              </div>

              {productsMode === 'custom' ? (
                <div className="mt-3 space-y-2">
                  {activeProducts.slice(0, 16).map((p) => {
                    const on = customEnabledSet[p.productId] ?? false
                    return (
                      <button
                        key={p.productId}
                        type="button"
                        className={cn(
                          'min-h-12 w-full rounded-xl border px-3 text-left text-sm font-bold transition-colors flex items-center justify-between gap-3',
                          on
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                            : 'border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50'
                        )}
                        onClick={() => setCustomEnabledSet((curr) => ({ ...curr, [p.productId]: !on }))}
                      >
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                        <span className="shrink-0 text-xs">{on ? 'ON' : 'OFF'}</span>
                      </button>
                    )
                  })}
                  <p className="text-[11px] text-zinc-600">
                    Seleccionados: {customEnabledIds.length === 0 ? ' ' : customEnabledIds.length}
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-xs text-zinc-600">Se usarán todos los productos activos globales.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {(tab === 'lista' || !canManage) ? (
        <div className={cn(cardClass, 'p-4')}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={headerPill}>Eventos</p>
              <p className="mt-1 text-xs text-zinc-600">Acceso al formulario público y pedidos recibidos.</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {events.map((e) => {
              const publicUrl = `/eventos/${e.slug}`
              return (
                <div key={e.id} className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-zinc-900">{e.name}</p>
                      <p className="mt-1 text-xs text-zinc-600">
                        {e.event_date} · {toHm(e.event_time)}h
                      </p>
                      <p className="mt-2 text-xs text-zinc-700">
                        Pedidos: <span className="font-black">{e.orders_count === 0 ? ' ' : e.orders_count}</span>
                      </p>
                    </div>
                    {canManage ? (
                      <button
                        type="button"
                        className={cn(
                          'min-h-12 min-w-[48px] shrink-0 rounded-xl border px-3 flex items-center justify-center transition-colors',
                          e.is_active
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                        )}
                        aria-label={e.is_active ? 'Desactivar evento' : 'Activar evento'}
                        onClick={() => {
                          startTransition(async () => {
                            const res = await setEventActiveAction({ eventId: e.id, isActive: !e.is_active })
                            if (!res.success) toast.error(res.message)
                          })
                        }}
                      >
                        {e.is_active ? <ToggleRight className="h-6 w-6" strokeWidth={2.5} /> : <ToggleLeft className="h-6 w-6" strokeWidth={2.5} />}
                      </button>
                    ) : (
                      <span
                        className={cn(
                          'min-h-12 shrink-0 rounded-xl border px-3 flex items-center justify-center text-[11px] font-black uppercase tracking-wider',
                          e.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-zinc-200 bg-zinc-50 text-zinc-500'
                        )}
                      >
                        {e.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={publicUrl}
                      className={cn(btnBase, 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200 inline-flex items-center gap-2')}
                      aria-label="Abrir formulario público"
                      target="_blank"
                    >
                      <ExternalLink className="h-4 w-4" strokeWidth={2.5} />
                      Abrir
                    </Link>
                    <button
                      type="button"
                      className={cn(btnBase, 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200 inline-flex items-center gap-2')}
                      onClick={() => safeClipboardCopy(typeof window !== 'undefined' ? `${window.location.origin}${publicUrl}` : publicUrl)}
                      aria-label="Copiar URL"
                    >
                      <Copy className="h-4 w-4" strokeWidth={2.5} />
                      Copiar URL
                    </button>
                    <Link
                      href={`/dashboard/eventos/${e.id}/pedidos`}
                      className={cn(btnBase, 'bg-[#36606F] text-white hover:bg-[#2a4a56] inline-flex items-center gap-2')}
                      aria-label="Ver pedidos"
                    >
                      Ver pedidos
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

