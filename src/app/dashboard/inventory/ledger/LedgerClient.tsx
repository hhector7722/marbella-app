'use client'

import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Search,
  AlertTriangle,
  Scale,
  Receipt,
  ShoppingCart,
  Loader2,
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

function displayStockCurrent(stock: number, unit: string) {
  const n = Number(stock)
  if (n === 0 || Object.is(n, -0)) {
    return <span className="font-medium text-gray-900">&nbsp;</span>
  }
  return (
    <span className="font-medium text-gray-900">
      {n} {unit}
    </span>
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

export function LedgerClient({ ingredients }: { ingredients: Ingredient[] }) {
  const [search, setSearch] = useState('')
  const [selectedIng, setSelectedIng] = useState<Ingredient | null>(null)
  const [movements, setMovements] = useState<Movement[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const filtered = ingredients.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase()),
  )

  const handleSelect = async (ing: Ingredient) => {
    setSelectedIng(ing)
    setIsLoading(true)
    try {
      const data = await getIngredientMovements(ing.id)
      setMovements((data as Movement[]) || [])
    } catch (error) {
      console.error(error)
      toast.error(
        error instanceof Error ? error.message : 'Error al cargar movimientos',
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      <div className="w-full lg:w-1/3 bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden shrink-0">
        <div className="p-4 border-b border-zinc-100 relative">
          <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar producto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full min-h-12 pl-10 pr-4 bg-zinc-50 border border-transparent rounded-xl text-sm focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
          />
        </div>
        <div className="overflow-y-auto h-[600px] divide-y divide-zinc-50">
          {filtered.map((ing) => (
            <button
              key={ing.id}
              type="button"
              onClick={() => handleSelect(ing)}
              className={cn(
                'w-full min-h-12 text-left py-3 px-4 hover:bg-zinc-50 transition-colors flex justify-between items-center gap-2',
                selectedIng?.id === ing.id
                  ? 'bg-blue-50/50 border-l-4 border-blue-600'
                  : 'border-l-4 border-transparent',
              )}
            >
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 truncate">{ing.name}</p>
                <p className="text-xs text-gray-500">{ing.category}</p>
              </div>
              <div className="text-right shrink-0">
                {displayStockCurrent(Number(ing.stock_current), ing.unit)}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="w-full lg:w-2/3 flex-1 bg-white rounded-2xl shadow-sm border border-zinc-100 min-h-[600px] flex flex-col">
        {!selectedIng ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 font-medium min-h-[600px]">
            Selecciona un ingrediente para ver su auditoría
          </div>
        ) : (
          <>
            <div className="p-6 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50 shrink-0">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selectedIng.name}</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Stock teórico actual:{' '}
                  <span className="font-bold text-gray-900">
                    {Number(selectedIng.stock_current) === 0 ||
                    Object.is(Number(selectedIng.stock_current), -0) ? (
                      '\u00A0'
                    ) : (
                      <>
                        {selectedIng.stock_current} {selectedIng.unit}
                      </>
                    )}
                  </span>
                </p>
              </div>
            </div>

            <div className="p-0 overflow-y-auto h-[520px] flex-1 min-h-0">
              {isLoading ? (
                <div className="flex justify-center p-10">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
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
