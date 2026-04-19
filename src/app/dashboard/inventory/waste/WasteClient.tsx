'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { AlertCircle, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { processWasteEntries } from './actions'

type Ingredient = {
  id: string
  name: string
  unit: string
  stock_current: number
  category: string
}

export function WasteClient({ initialIngredients }: { initialIngredients: Ingredient[] }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [amounts, setAmounts] = useState<Record<string, string>>({})

  const handleChange = (id: string, value: string) => {
    if (/^\d*\.?\d*$/.test(value)) {
      setAmounts((prev) => ({ ...prev, [id]: value }))
    }
  }

  const handleSubmit = async () => {
    const payload = Object.entries(amounts)
      .map(([ingredient_id, raw]) => {
        const item = initialIngredients.find((i) => i.id === ingredient_id)
        const q = parseFloat(raw)
        if (!item || !Number.isFinite(q) || q <= 0) return null
        return { ingredient_id, quantity: q, unit: item.unit }
      })
      .filter(Boolean) as { ingredient_id: string; quantity: number; unit: string }[]

    if (payload.length === 0) {
      toast.error('Indica al menos una cantidad de merma mayor que cero.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await processWasteEntries(payload)
      if (res.success) {
        toast.success(res.message)
        setAmounts({})
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al registrar mermas')
    } finally {
      setIsSubmitting(false)
    }
  }

  const grouped = initialIngredients.reduce((acc, curr) => {
    ;(acc[curr.category] = acc[curr.category] || []).push(curr)
    return acc
  }, {} as Record<string, Ingredient[]>)

  return (
    <div className="flex flex-col gap-6 pb-28">
      <p className="text-sm text-zinc-600">
        Registra la cantidad <span className="font-semibold text-zinc-800">consumida o perdida</span> por
        ingrediente. Se guardará como movimiento tipo merma y descontará del stock teórico.
      </p>

      {Object.entries(grouped).map(([category, items]) => (
        <section
          key={category}
          className="rounded-xl border border-zinc-100 bg-zinc-50/80 overflow-hidden shrink-0"
        >
          <div className="bg-zinc-100/80 px-4 py-3 border-b border-zinc-100 font-semibold text-zinc-700 text-sm">
            {category}
          </div>
          <div className="divide-y divide-zinc-100">
            {items.map((item) => {
              const displayTeorico =
                item.stock_current === 0 || Object.is(item.stock_current, -0)
                  ? '\u00A0'
                  : `${item.stock_current}`

              return (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 hover:bg-white/60 transition-colors"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-base font-medium text-zinc-900">{item.name}</span>
                    <span className="text-sm text-zinc-500">
                      Stock teórico:{' '}
                      <span className="font-medium text-zinc-700 tabular-nums">
                        {displayTeorico} {item.unit}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={amounts[item.id] ?? ''}
                      onChange={(e) => handleChange(item.id, e.target.value)}
                      className={cn(
                        'w-28 min-h-12 text-center text-lg font-medium rounded-xl border border-zinc-200',
                        'bg-white focus:border-[#36606F] focus:ring-2 focus:ring-[#36606F]/20 transition-all touch-manipulation',
                      )}
                      aria-label={`Merma ${item.name}`}
                    />
                    <span className="text-zinc-500 font-medium w-10">{item.unit}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}

      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-lg bg-zinc-900 rounded-2xl p-2 shadow-2xl flex items-center justify-between gap-2 z-50 shrink-0">
        <div className="flex items-center gap-2 text-zinc-300 px-3 min-w-0">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="text-xs sm:text-sm truncate">Solo se envían filas con cantidad &gt; 0</span>
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={
            isSubmitting ||
            !Object.values(amounts).some((v) => {
              const n = parseFloat(v)
              return Number.isFinite(n) && n > 0
            })
          }
          className="min-h-12 px-5 flex items-center gap-2 bg-white text-zinc-900 rounded-xl font-bold hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all shrink-0"
        >
          <Save className="w-5 h-5" />
          {isSubmitting ? 'Guardando…' : 'Registrar mermas'}
        </button>
      </div>
    </div>
  )
}
