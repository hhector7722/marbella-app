'use client'

import { useMemo, useRef, useState, useEffect } from 'react'
import { toast } from 'sonner'
import { ChevronDown, Minus, Plus, Save, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { processRecipeWaste, processWasteEntries } from './actions'

type Ingredient = {
  id: string
  name: string
  unit: string
  category: string
}

type RecipeOption = { id: string; name: string }

type WasteMode = 'recipes' | 'ingredients'

function isCountUnit(unit: string): boolean {
  const u = unit.trim().toLowerCase()
  return u === 'ud' || u === 'u' || u === 'unidad' || u === 'un' || u === 'unidades'
}

function getStep(unit: string): number {
  if (isCountUnit(unit)) return 1
  const u = unit.trim().toLowerCase()
  if (u === 'kg' || u === 'l' || u === 'lt' || u === 'litro') return 0.01
  return 1
}

function roundQty(n: number, unit: string): number {
  if (isCountUnit(unit)) return Math.max(0, Math.round(n))
  const step = getStep(unit)
  const decimals = step < 1 ? 4 : 0
  const f = Math.round(n / step) * step
  return Math.max(0, Number(f.toFixed(decimals)))
}

function parseQuantity(raw: string, unit: string): number {
  const t = raw.replace(',', '.').trim()
  if (t === '') return 0
  const n = parseFloat(t)
  if (!Number.isFinite(n) || n < 0) return 0
  return roundQty(n, unit)
}

function QuantityStepper({
  unit,
  value,
  onChange,
  ariaLabel,
}: {
  unit: string
  value: number
  onChange: (n: number) => void
  ariaLabel: string
}) {
  const step = getStep(unit)
  const count = isCountUnit(unit)

  const adjust = (delta: number) => {
    onChange(roundQty(Math.max(0, value + delta), unit))
  }

  const display =
    value === 0
      ? ''
      : count
        ? String(Math.round(value))
        : String(value).length > 8
          ? value.toFixed(4).replace(/\.?0+$/, '')
          : String(value)

  return (
    <div
      className={cn(
        'flex items-center justify-between w-full max-w-[220px] border border-zinc-200 rounded-xl overflow-hidden bg-white shadow-sm',
        'min-h-[48px] focus-within:ring-2 focus-within:ring-[#36606F]/25 focus-within:border-[#36606F]/40',
      )}
    >
      <button
        type="button"
        onClick={() => adjust(-step)}
        className="h-12 w-11 shrink-0 flex items-center justify-center text-zinc-500 hover:bg-rose-50 hover:text-rose-600 active:bg-rose-100 transition-colors"
        aria-label={`Menos ${ariaLabel}`}
      >
        <Minus className="w-5 h-5" strokeWidth={2.5} />
      </button>
      <input
        type="text"
        inputMode="decimal"
        value={display}
        onChange={(e) => onChange(parseQuantity(e.target.value, unit))}
        className="flex-1 min-w-0 h-12 bg-transparent text-center font-black text-zinc-800 text-sm tabular-nums outline-none"
        aria-label={ariaLabel}
      />
      <button
        type="button"
        onClick={() => adjust(step)}
        className="h-12 w-11 shrink-0 flex items-center justify-center text-zinc-500 hover:bg-emerald-50 hover:text-emerald-600 active:bg-emerald-100 transition-colors"
        aria-label={`Más ${ariaLabel}`}
      >
        <Plus className="w-5 h-5" strokeWidth={2.5} />
      </button>
      <span className="pr-3 text-xs font-bold text-zinc-500 w-10 text-center shrink-0">{unit}</span>
    </div>
  )
}

function RecipePicker({
  recipes,
  selectedId,
  onSelect,
}: {
  recipes: RecipeOption[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return recipes.slice(0, 80)
    return recipes.filter((r) => r.name.toLowerCase().includes(s)).slice(0, 80)
  }, [recipes, q])

  const selected = recipes.find((r) => r.id === selectedId)

  return (
    <div className="relative" ref={wrap}>
      <div className="flex gap-2 items-stretch">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="min-h-[48px] flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left shadow-sm flex items-center justify-between gap-2 hover:bg-zinc-50/80 transition-colors"
        >
          <span className={cn('truncate font-semibold text-sm', selected ? 'text-zinc-900' : 'text-zinc-400')}>
            {selected ? selected.name : 'Seleccionar receta…'}
          </span>
          <ChevronDown className={cn('w-5 h-5 text-zinc-400 shrink-0 transition-transform', open && 'rotate-180')} />
        </button>
        {selectedId ? (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="min-h-[48px] min-w-[48px] shrink-0 flex items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 transition-colors"
            aria-label="Quitar receta"
          >
            <X className="w-5 h-5" />
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="absolute z-50 mt-2 w-full rounded-xl border border-zinc-200 bg-white shadow-xl overflow-hidden">
          <div className="p-2 border-b border-zinc-100 bg-zinc-50">
            <input
              className="h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-[#36606F]/30"
              placeholder="Buscar receta…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
          </div>
          <ul className="max-h-[280px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-zinc-500">Sin resultados.</li>
            ) : (
              filtered.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className={cn(
                      'w-full px-4 py-3 text-left text-sm font-semibold hover:bg-zinc-100 transition-colors',
                      r.id === selectedId ? 'bg-emerald-50 text-emerald-800' : 'text-zinc-800',
                    )}
                    onClick={() => {
                      onSelect(r.id)
                      setOpen(false)
                      setQ('')
                    }}
                  >
                    {r.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

export function WasteClient({
  initialIngredients,
  recipes,
}: {
  initialIngredients: Ingredient[]
  recipes: RecipeOption[]
}) {
  const [mode, setMode] = useState<WasteMode>('recipes')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [recipeId, setRecipeId] = useState<string | null>(null)
  const [recipeUnits, setRecipeUnits] = useState(0)

  const [amounts, setAmounts] = useState<Record<string, number>>({})

  const grouped = useMemo(() => {
    return initialIngredients.reduce((acc, curr) => {
      ;(acc[curr.category] = acc[curr.category] || []).push(curr)
      return acc
    }, {} as Record<string, Ingredient[]>)
  }, [initialIngredients])

  const setIngredientQty = (id: string, unit: string, n: number) => {
    setAmounts((prev) => ({ ...prev, [id]: roundQty(n, unit) }))
  }

  const canSubmitRecipes = recipeId != null && recipeUnits > 0
  const canSubmitIngredients = Object.values(amounts).some((n) => Number.isFinite(n) && n > 0)

  const handleSubmit = async () => {
    if (mode === 'recipes') {
      if (!recipeId || recipeUnits <= 0) {
        toast.error('Elige una receta y un número de unidades mayor que cero.')
        return
      }
      setIsSubmitting(true)
      try {
        const res = await processRecipeWaste(recipeId, recipeUnits)
        if (res.success) {
          toast.success(res.message)
          setRecipeUnits(0)
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Error al registrar')
      } finally {
        setIsSubmitting(false)
      }
      return
    }

    const payload = Object.entries(amounts)
      .map(([ingredient_id, quantity]) => {
        const item = initialIngredients.find((i) => i.id === ingredient_id)
        if (!item || !Number.isFinite(quantity) || quantity <= 0) return null
        return { ingredient_id, quantity, unit: item.unit }
      })
      .filter(Boolean) as { ingredient_id: string; quantity: number; unit: string }[]

    if (payload.length === 0) {
      toast.error('Indica al menos una pérdida mayor que cero.')
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
      toast.error(e instanceof Error ? e.message : 'Error al registrar')
    } finally {
      setIsSubmitting(false)
    }
  }

  const submitDisabled =
    isSubmitting || (mode === 'recipes' ? !canSubmitRecipes : !canSubmitIngredients)

  return (
    <div className="flex flex-col gap-6 pb-4">
      <div className="flex flex-col gap-3 shrink-0">
        <p className="text-sm text-zinc-600">
          Registra aquí la <span className="font-semibold text-zinc-800">pérdida</span> de producto. Se guardará
          como movimiento tipo merma.
        </p>

        <div className="flex shrink-0 rounded-xl bg-zinc-100 p-1.5 w-full max-w-md">
          <button
            type="button"
            onClick={() => {
              setMode('recipes')
              setAmounts({})
            }}
            className={cn(
              'flex-1 min-h-[48px] rounded-lg text-sm font-black uppercase tracking-wide transition-colors',
              mode === 'recipes' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800',
            )}
          >
            Recetas
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('ingredients')
              setRecipeId(null)
              setRecipeUnits(0)
            }}
            className={cn(
              'flex-1 min-h-[48px] rounded-lg text-sm font-black uppercase tracking-wide transition-colors',
              mode === 'ingredients' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800',
            )}
          >
            Ingredientes
          </button>
        </div>
      </div>

      {mode === 'recipes' ? (
        <div className="flex flex-col gap-4 rounded-xl border border-zinc-100 bg-zinc-50/80 p-4">
          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Receta</label>
          <RecipePicker recipes={recipes} selectedId={recipeId} onSelect={setRecipeId} />
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500 block mb-2">
              Unidades (raciones / salidas)
            </label>
            <QuantityStepper
              unit="ud"
              value={recipeUnits}
              onChange={setRecipeUnits}
              ariaLabel="Unidades de receta"
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {Object.entries(grouped).map(([category, items]) => (
            <section
              key={category}
              className="rounded-xl border border-zinc-100 bg-zinc-50/80 overflow-hidden shrink-0"
            >
              <div className="bg-zinc-100/80 px-4 py-3 border-b border-zinc-100 font-semibold text-zinc-700 text-sm">
                {category}
              </div>
              <div className="divide-y divide-zinc-100">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 hover:bg-white/60 transition-colors"
                  >
                    <span className="text-base font-medium text-zinc-900 min-w-0 pr-2">{item.name}</span>
                    <QuantityStepper
                      unit={item.unit}
                      value={amounts[item.id] ?? 0}
                      onChange={(n) => setIngredientQty(item.id, item.unit, n)}
                      ariaLabel={`Pérdida ${item.name}`}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitDisabled}
        className={cn(
          'w-full min-h-[48px] rounded-xl font-black uppercase tracking-wider text-sm',
          'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800',
          'disabled:opacity-45 disabled:cursor-not-allowed transition-colors',
          'flex items-center justify-center gap-2 shrink-0',
        )}
      >
        <Save className="w-5 h-5 shrink-0" />
        {isSubmitting ? 'Guardando…' : 'Registrar mermas'}
      </button>
    </div>
  )
}
