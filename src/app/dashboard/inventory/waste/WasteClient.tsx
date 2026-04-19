'use client'

import { useMemo, useState, useEffect } from 'react'
import { toast } from 'sonner'
import { ChefHat, Minus, Package, Plus, Save, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { processRecipeWaste, processWasteEntries } from './actions'

type Ingredient = {
  id: string
  name: string
  unit: string
  category: string
  image_url: string | null
  order_unit: string | null
}

type RecipeOption = { id: string; name: string; photo_url: string | null }

type WasteMode = 'recipes' | 'ingredients'

const WASTE_UNIT_PRESETS = [
  'ud',
  'u',
  'unidad',
  'unidades',
  'kg',
  'g',
  'l',
  'ml',
  'lt',
  'litro',
  'pack',
  'caja',
  'pieza',
  'bandeja',
  'bolsa',
] as const

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
  hideUnitSuffix,
}: {
  unit: string
  value: number
  onChange: (n: number) => void
  ariaLabel: string
  hideUnitSuffix?: boolean
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
        'flex items-center justify-between w-full border border-zinc-200 rounded-xl overflow-hidden bg-white shadow-sm',
        'min-h-[48px] focus-within:ring-2 focus-within:ring-[#36606F]/25 focus-within:border-[#36606F]/40',
        !hideUnitSuffix && 'max-w-[220px]',
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
      {!hideUnitSuffix ? (
        <span className="pr-3 text-xs font-bold text-zinc-500 w-10 text-center shrink-0">{unit}</span>
      ) : null}
    </div>
  )
}

function WasteUnitSelect({
  value,
  ingredientUnit,
  orderUnit,
  onChange,
}: {
  value: string
  ingredientUnit: string
  orderUnit: string | null
  onChange: (u: string) => void
}) {
  const options = useMemo(() => {
    const s = new Set<string>(
      [...WASTE_UNIT_PRESETS, ingredientUnit, orderUnit, value].filter(Boolean) as string[],
    )
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
  }, [ingredientUnit, orderUnit, value])

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-full min-h-[48px] rounded-xl border border-zinc-200 bg-white px-3 text-xs font-black uppercase tracking-wide text-zinc-700 shadow-sm',
        'outline-none focus:ring-2 focus:ring-[#36606F]/25 focus:border-[#36606F]/40',
      )}
      aria-label="Unidad de medida"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  )
}

function RecipeWasteCard({
  recipe,
  value,
  onChange,
}: {
  recipe: RecipeOption
  value: number
  onChange: (n: number) => void
}) {
  return (
    <div className="flex flex-col bg-white rounded-2xl shadow-md overflow-hidden h-full border border-zinc-100 hover:shadow-lg transition-shadow">
      <div className="flex flex-col items-center flex-1 min-h-0 p-2">
        <div className="w-full aspect-square max-h-28 bg-white flex items-center justify-center overflow-hidden rounded-xl border border-zinc-100 shrink-0 mb-2">
          {recipe.photo_url ? (
            <img src={recipe.photo_url} alt="" className="h-full w-full object-contain" />
          ) : (
            <ChefHat className="w-10 h-10 text-zinc-200" strokeWidth={1.5} />
          )}
        </div>
        <span
          className="text-[10px] min-[380px]:text-[11px] font-black text-zinc-800 leading-tight w-full text-center line-clamp-2 min-h-[2.5rem]"
          title={recipe.name}
        >
          {recipe.name}
        </span>
      </div>
      <div className="shrink-0 p-2 pt-0 flex flex-col gap-1 border-t border-zinc-100 bg-zinc-50/50">
        <label className="sr-only">Cantidad merma {recipe.name}</label>
        <QuantityStepper
          unit="ud"
          value={value}
          onChange={onChange}
          ariaLabel={`Unidades ${recipe.name}`}
        />
      </div>
    </div>
  )
}

function IngredientWasteCard({
  item,
  amount,
  wasteUnit,
  onAmountChange,
  onUnitChange,
}: {
  item: Ingredient
  amount: number
  wasteUnit: string
  onAmountChange: (n: number) => void
  onUnitChange: (u: string) => void
}) {
  return (
    <div className="flex flex-col bg-white rounded-2xl shadow-md overflow-hidden h-full border border-zinc-100 hover:shadow-lg transition-shadow">
      <div className="flex flex-col items-center flex-1 min-h-0 p-2">
        <div className="w-full aspect-square max-h-28 bg-white flex items-center justify-center overflow-hidden rounded-xl border border-zinc-100 shrink-0 mb-2">
          {item.image_url ? (
            <img src={item.image_url} alt="" className="h-full w-full object-contain" />
          ) : (
            <Package className="w-10 h-10 text-zinc-200" strokeWidth={1.5} />
          )}
        </div>
        <span
          className="text-[10px] min-[380px]:text-[11px] font-black text-zinc-800 leading-tight w-full text-center line-clamp-2 min-h-[2.5rem]"
          title={item.name}
        >
          {item.name}
        </span>
      </div>
      <div className="shrink-0 p-2 pt-0 flex flex-col gap-2 border-t border-zinc-100 bg-zinc-50/50">
        <WasteUnitSelect
          value={wasteUnit}
          ingredientUnit={item.unit}
          orderUnit={item.order_unit}
          onChange={onUnitChange}
        />
        <QuantityStepper
          unit={wasteUnit}
          value={amount}
          onChange={onAmountChange}
          ariaLabel={`Pérdida ${item.name}`}
          hideUnitSuffix
        />
      </div>
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

  const [recipeAmounts, setRecipeAmounts] = useState<Record<string, number>>({})
  const [recipeQuery, setRecipeQuery] = useState('')

  const [amounts, setAmounts] = useState<Record<string, number>>({})
  const [wasteUnits, setWasteUnits] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialIngredients.map((i) => [i.id, (i.unit || 'ud').trim() || 'ud'])),
  )

  useEffect(() => {
    setWasteUnits((prev) => {
      const next = { ...prev }
      for (const i of initialIngredients) {
        const def = (i.unit || 'ud').trim() || 'ud'
        if (next[i.id] === undefined) next[i.id] = def
      }
      return next
    })
  }, [initialIngredients])

  const filteredRecipes = useMemo(() => {
    const s = recipeQuery.trim().toLowerCase()
    if (!s) return recipes
    return recipes.filter((r) => r.name.toLowerCase().includes(s))
  }, [recipes, recipeQuery])

  const grouped = useMemo(() => {
    return initialIngredients.reduce(
      (acc, curr) => {
        ;(acc[curr.category] = acc[curr.category] || []).push(curr)
        return acc
      },
      {} as Record<string, Ingredient[]>,
    )
  }, [initialIngredients])

  const setIngredientQty = (id: string, unit: string, n: number) => {
    setAmounts((prev) => ({ ...prev, [id]: roundQty(n, unit) }))
  }

  const canSubmitRecipes = useMemo(
    () => Object.values(recipeAmounts).some((n) => Number.isFinite(n) && n > 0),
    [recipeAmounts],
  )
  const canSubmitIngredients = Object.values(amounts).some((n) => Number.isFinite(n) && n > 0)

  const handleSubmit = async () => {
    if (mode === 'recipes') {
      const lines = Object.entries(recipeAmounts).filter(([, q]) => Number.isFinite(q) && q > 0)
      if (lines.length === 0) {
        toast.error('Indica al menos una receta con unidades mayor que cero.')
        return
      }
      setIsSubmitting(true)
      try {
        for (const [rid, qty] of lines) {
          await processRecipeWaste(rid, qty)
        }
        toast.success(
          lines.length === 1
            ? 'Merma de receta registrada.'
            : `Registradas ${lines.length} mermas de receta.`,
        )
        setRecipeAmounts((prev) => {
          const next = { ...prev }
          lines.forEach(([id]) => {
            next[id] = 0
          })
          return next
        })
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
        const u = wasteUnits[ingredient_id] ?? item?.unit ?? 'ud'
        if (!item || !Number.isFinite(quantity) || quantity <= 0) return null
        return { ingredient_id, quantity, unit: u }
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
              setRecipeAmounts({})
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
        <div className="flex flex-col gap-4">
          <div className="relative w-full shrink-0">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar receta…"
              value={recipeQuery}
              onChange={(e) => setRecipeQuery(e.target.value)}
              className="w-full min-h-[48px] pl-10 pr-4 rounded-xl border border-zinc-200 bg-white text-sm font-medium text-zinc-800 shadow-sm outline-none focus:ring-2 focus:ring-[#36606F]/25 focus:border-[#36606F]/40"
            />
          </div>
          {filteredRecipes.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-8">No hay recetas que coincidan.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 gap-2.5 sm:gap-6">
              {filteredRecipes.map((r) => (
                <RecipeWasteCard
                  key={r.id}
                  recipe={r}
                  value={recipeAmounts[r.id] ?? 0}
                  onChange={(n) => setRecipeAmounts((prev) => ({ ...prev, [r.id]: n }))}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {Object.entries(grouped).map(([category, items]) => (
            <section key={category} className="flex flex-col gap-3 shrink-0">
              <div className="text-sm font-black uppercase tracking-wide text-zinc-500 px-0.5">{category}</div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 gap-2.5 sm:gap-6">
                {items.map((item) => {
                  const wu = wasteUnits[item.id] ?? item.unit
                  return (
                    <IngredientWasteCard
                      key={item.id}
                      item={item}
                      amount={amounts[item.id] ?? 0}
                      wasteUnit={wu}
                      onAmountChange={(n) => setIngredientQty(item.id, wu, n)}
                      onUnitChange={(newUnit) => {
                        setWasteUnits((prev) => ({ ...prev, [item.id]: newUnit }))
                        setAmounts((prev) => ({
                          ...prev,
                          [item.id]: roundQty(prev[item.id] ?? 0, newUnit),
                        }))
                      }}
                    />
                  )
                })}
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
