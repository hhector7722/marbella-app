'use client'

import { useEffect, useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Search,
  AlertTriangle,
  Scale,
  Receipt,
  ShoppingCart,
  Loader2,
  Filter,
  Package,
} from 'lucide-react'
import { toast } from 'sonner'
import { getIngredientMovements } from './actions'
import { cn } from '@/lib/utils'

type Ingredient = {
  id: string
  name: string
  unit: string
  stock_current: number
  category: string
  image_url: string | null
  order_unit: string | null
}

type Movement = {
  id: string
  movement_type: string
  quantity: number
  movement_date: string
  reference_doc: string | null
  original_description: string | null
  processed_by: string | null
}

const TYPE_CONFIG: Record<
  string,
  { label: string; icon: LucideIcon; color: string; bg: string }
> = {
  PURCHASE: {
    label: 'Entrada',
    icon: ShoppingCart,
    color: 'text-green-700',
    bg: 'bg-green-50',
  },
  SALE: {
    label: 'Venta TPV',
    icon: Receipt,
    color: 'text-red-700',
    bg: 'bg-red-50',
  },
  WASTE: {
    label: 'Merma',
    icon: AlertTriangle,
    color: 'text-orange-700',
    bg: 'bg-orange-50',
  },
  INVENTORY_COUNT: {
    label: 'Arqueo',
    icon: Scale,
    color: 'text-purple-700',
    bg: 'bg-purple-50',
  },
  ADJUSTMENT: {
    label: 'Ajuste',
    icon: Scale,
    color: 'text-zinc-700',
    bg: 'bg-zinc-50',
  },
}

function abbreviateLabel(name: string, maxChars = 22): string {
  const t = name.replace(/\s+/g, ' ').trim()
  if (t.length <= maxChars) return t
  const cut = Math.max(8, maxChars - 1)
  return `${t.slice(0, cut)}…`
}

function movementRowStyle(mov: Movement): {
  label: string
  icon: LucideIcon
  color: string
  bg: string
} {
  const qty = Number(mov.quantity)
  const base = TYPE_CONFIG[mov.movement_type] ?? TYPE_CONFIG.ADJUSTMENT

  if (mov.movement_type === 'INVENTORY_COUNT') {
    if (qty >= 0) {
      return {
        label: 'Arqueo (entrada)',
        icon: base.icon,
        color: 'text-green-700',
        bg: 'bg-green-50',
      }
    }
    return {
      label: 'Arqueo (salida)',
      icon: base.icon,
      color: 'text-orange-700',
      bg: 'bg-orange-50',
    }
  }

  if (mov.movement_type === 'ADJUSTMENT') {
    if (qty >= 0) {
      return {
        ...base,
        label: 'Ajuste (entrada)',
        color: 'text-green-700',
        bg: 'bg-green-50',
      }
    }
    return {
      ...base,
      label: 'Ajuste (salida)',
      color: 'text-red-700',
      bg: 'bg-red-50',
    }
  }

  return base
}

function isOutflow(type: string, qty: number): boolean {
  if (type === 'SALE' || type === 'WASTE') return true
  if (type === 'INVENTORY_COUNT' && qty < 0) return true
  if (type === 'ADJUSTMENT' && qty < 0) return true
  return false
}

function formatQuantity(qty: number, type: string) {
  const n = Number(qty)
  const negative = isOutflow(type, n)
  const sign = negative ? '-' : '+'
  const val = Math.abs(n).toFixed(2)
  const colorClass = negative ? 'text-red-600' : 'text-green-600'
  return (
    <span className={cn('font-bold', colorClass)}>
      {sign}
      {val}
    </span>
  )
}

function ReadOnlyStockBox({
  stock,
  unit,
  className,
}: {
  stock: number
  unit: string
  className?: string
}) {
  const n = Number(stock)
  const empty = n === 0 || Object.is(n, -0)
  return (
    <div
      className={cn(
        'flex items-stretch justify-between min-w-0',
        'bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm min-h-[48px]',
        className,
      )}
    >
      <div className="flex-1 flex items-center justify-center px-2 min-w-0">
        <span className="text-center font-black tabular-nums text-sm text-zinc-800">
          {empty ? '\u00A0' : String(n)}
        </span>
      </div>
      <span className="pr-3 flex items-center text-[10px] font-black text-zinc-500 uppercase tracking-wide shrink-0 border-l border-zinc-100">
        {unit}
      </span>
    </div>
  )
}

function displayReference(ref: string | null) {
  const t = ref?.trim()
  if (!t) return <span className="text-xs text-gray-400">&nbsp;</span>
  return (
    <p className="text-xs text-gray-500 font-mono mt-1" title={t}>
      {t}
    </p>
  )
}

function LedgerIngredientCard({
  item,
  selected,
  onSelect,
}: {
  item: Ingredient
  selected: boolean
  onSelect: () => void
}) {
  const label = abbreviateLabel(item.name)
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex h-full min-h-0 flex-col rounded-xl border bg-white shadow-sm overflow-hidden text-left transition-shadow',
        'hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#36606F]/30',
        selected ? 'ring-2 ring-[#36606F]/50 border-[#36606F]/30' : 'border-zinc-100',
      )}
    >
      <div className="shrink-0 h-14 w-full flex items-center justify-center bg-zinc-50/40">
        {item.image_url ? (
          <img src={item.image_url} alt="" className="h-12 w-12 object-contain" />
        ) : (
          <Package className="w-8 h-8 text-zinc-200" strokeWidth={1.5} />
        )}
      </div>
      <div className="shrink-0 min-h-[2.5rem] px-2 py-1.5 flex flex-col items-center justify-center min-w-0 flex-1">
        <span
          className="w-full min-w-0 text-center text-[10px] min-[380px]:text-[11px] font-black text-zinc-800 whitespace-nowrap overflow-hidden text-ellipsis"
          title={item.name}
        >
          {label}
        </span>
      </div>
      <div className="mt-auto shrink-0 px-2 pb-2 pt-0 w-full">
        <ReadOnlyStockBox
          stock={Number(item.stock_current)}
          unit={item.unit}
          className="w-full shadow-none"
        />
      </div>
    </button>
  )
}

export function LedgerClient({ ingredients }: { ingredients: Ingredient[] }) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [selectedIng, setSelectedIng] = useState<Ingredient | null>(null)
  const [movements, setMovements] = useState<Movement[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!filterOpen) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest('[data-ledger-filter-root="true"]')) return
      setFilterOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFilterOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [filterOpen])

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const i of ingredients) {
      const c = (i.category ?? '').trim()
      if (c) set.add(c)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
  }, [ingredients])

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = ingredients.filter((i) => {
      const okText = !q || i.name.toLowerCase().includes(q)
      const okCat = !category || i.category === category
      return okText && okCat
    })
    return list.reduce(
      (acc, curr) => {
        ;(acc[curr.category] = acc[curr.category] || []).push(curr)
        return acc
      },
      {} as Record<string, Ingredient[]>,
    )
  }, [ingredients, search, category])

  const handleSelect = async (ing: Ingredient) => {
    setSelectedIng(ing)
    setIsLoading(true)
    try {
      const data = await getIngredientMovements(ing.id)
      setMovements((data as Movement[]) || [])
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Error al cargar movimientos')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col xl:flex-row gap-4 items-stretch min-h-0 flex-1">
      <div className="w-full xl:w-[min(100%,520px)] xl:max-w-[44%] shrink-0 flex flex-col gap-3 min-h-0">
        <div className="flex items-center gap-2 w-full shrink-0 relative">
          <div className="relative w-full flex-1 min-w-0">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar ingrediente…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full min-h-[48px] pl-10 pr-4 rounded-xl border border-zinc-200 bg-white text-sm font-medium text-zinc-800 shadow-sm outline-none focus:ring-2 focus:ring-[#36606F]/25 focus:border-[#36606F]/40"
            />
          </div>
          <div className="shrink-0 relative">
            <button
              type="button"
              onClick={() => setFilterOpen((v) => !v)}
              className={cn(
                'min-h-[48px] min-w-[48px] flex items-center justify-center',
                'rounded-xl border-0 bg-transparent hover:bg-zinc-100/60 active:bg-zinc-100 transition-colors',
                category ? 'text-[#36606F]' : 'text-zinc-400',
              )}
              aria-label="Filtrar por categoría"
              title="Filtrar"
              data-ledger-filter-root="true"
            >
              <Filter className="w-5 h-5" strokeWidth={2.5} />
            </button>
            {filterOpen ? (
              <div
                className="absolute right-0 mt-2 w-64 rounded-2xl bg-white text-zinc-900 shadow-2xl border border-zinc-100 overflow-hidden z-20"
                data-ledger-filter-root="true"
              >
                <button
                  type="button"
                  onClick={() => {
                    setCategory(null)
                    setFilterOpen(false)
                  }}
                  className={cn(
                    'w-full min-h-12 px-4 py-3 flex items-center justify-between hover:bg-zinc-50 active:bg-zinc-100 transition-colors',
                    !category && 'bg-zinc-50',
                  )}
                >
                  <span className="text-[11px] font-black uppercase tracking-widest">Todas</span>
                  <span className="text-[10px] font-black text-zinc-400">{ingredients.length}</span>
                </button>
                <div className="h-px bg-zinc-100" />
                <div className="max-h-72 overflow-auto">
                  {categories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setCategory(c)
                        setFilterOpen(false)
                      }}
                      className={cn(
                        'w-full min-h-12 px-4 py-3 text-left hover:bg-zinc-50 active:bg-zinc-100 transition-colors',
                        category === c && 'bg-zinc-50',
                      )}
                    >
                      <span className="text-[11px] font-black uppercase tracking-widest text-zinc-700">{c}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex-1 min-h-[min(480px,55vh)] max-h-[min(640px,70vh)] overflow-y-auto pr-0.5">
          {Object.keys(grouped).length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-8">No hay ingredientes que coincidan.</p>
          ) : (
            <div className="flex flex-col gap-6">
              {Object.entries(grouped).map(([cat, items]) => (
                <section key={cat} className="flex flex-col gap-3">
                  <div className="text-sm font-black uppercase tracking-wide text-zinc-500 px-0.5">{cat}</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-4 items-stretch justify-items-stretch">
                    {items.map((ing) => (
                      <LedgerIngredientCard
                        key={ing.id}
                        item={ing}
                        selected={selectedIng?.id === ing.id}
                        onSelect={() => handleSelect(ing)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="w-full flex-1 min-w-0 rounded-xl border border-zinc-100 bg-zinc-50/80 min-h-[min(520px,55vh)] flex flex-col">
        {!selectedIng ? (
          <div className="flex-1 flex items-center justify-center text-zinc-400 font-medium px-6 py-16 text-center text-sm">
            Selecciona un ingrediente para ver sus movimientos
          </div>
        ) : (
          <>
            <div className="p-4 sm:p-6 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center gap-4 justify-between bg-zinc-50/50 shrink-0">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="shrink-0 h-14 w-14 rounded-xl bg-white border border-zinc-100 flex items-center justify-center">
                  {selectedIng.image_url ? (
                    <img src={selectedIng.image_url} alt="" className="h-12 w-12 object-contain" />
                  ) : (
                    <Package className="w-8 h-8 text-zinc-200" strokeWidth={1.5} />
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900 truncate" title={selectedIng.name}>
                    {selectedIng.name}
                  </h2>
                  <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 mt-0.5 truncate">
                    {selectedIng.category}
                  </p>
                </div>
              </div>
              <div className="shrink-0 w-full sm:w-auto sm:max-w-[220px]">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-1 sm:text-right">
                  Stock teórico
                </p>
                <ReadOnlyStockBox
                  stock={Number(selectedIng.stock_current)}
                  unit={selectedIng.unit}
                  className="w-full sm:ml-auto sm:max-w-[200px]"
                />
              </div>
            </div>

            <div className="p-0 overflow-y-auto flex-1 min-h-[240px]">
              {isLoading ? (
                <div className="flex justify-center p-10">
                  <Loader2 className="w-8 h-8 animate-spin text-[#36606F]" />
                </div>
              ) : movements.length === 0 ? (
                <div className="p-10 text-center text-gray-500">No hay movimientos registrados.</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="bg-zinc-50 sticky top-0 border-b border-zinc-100 z-10">
                    <tr>
                      <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Fecha / Ref
                      </th>
                      <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Tipo
                      </th>
                      <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">
                        Impacto
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {movements.map((mov) => {
                      const conf = movementRowStyle(mov)
                      const Icon = conf.icon

                      return (
                        <tr key={mov.id} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="p-4 align-top w-2/5">
                            <p className="text-sm font-medium text-gray-900">
                              {new Date(mov.movement_date).toLocaleString('es-ES', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                            {displayReference(mov.reference_doc)}
                            {mov.original_description ? (
                              <p
                                className="text-xs text-gray-400 mt-1 line-clamp-1"
                                title={mov.original_description}
                              >
                                {mov.original_description}
                              </p>
                            ) : null}
                          </td>
                          <td className="p-4 align-top w-1/4">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium',
                                conf.bg,
                                conf.color,
                              )}
                            >
                              <Icon className="w-3.5 h-3.5 shrink-0" />
                              {conf.label}
                            </span>
                          </td>
                          <td className="p-4 align-top text-right w-1/4">
                            <div className="text-base flex justify-end">
                              {formatQuantity(mov.quantity, mov.movement_type)}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">{selectedIng.unit}</p>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
