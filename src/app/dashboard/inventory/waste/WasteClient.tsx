'use client'

import { useMemo, useState, useEffect } from 'react'
import { toast } from 'sonner'
import { ChefHat, Filter, Minus, Package, Plus, Save, Search } from 'lucide-react'
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

type RecipeOption = { id: string; name: string; photo_url: string | null; category?: string | null }

type WasteMode = 'recipes' | 'ingredients'

const WASTE_UNIT_PRESETS = [
  // Canónicas (deduplicadas por significado, no por string)
  'ud',
  'kg',
  'g',
  'l',
  'ml',
  'pack',
  'caja',
  'pieza',
  'bandeja',
  'bolsa',
] as const

function normalizeWasteUnit(unit: string | null | undefined): string {
  const raw = (unit ?? '').trim().toLowerCase()
  if (!raw) return 'ud'

  // Unidades (conteo)
  if (raw === 'ud' || raw === 'u' || raw === 'un' || raw === 'unidad' || raw === 'unidades') return 'ud'

  // Litros
  if (raw === 'l' || raw === 'lt' || raw === 'litro' || raw === 'litros') return 'l'

  // Mililitros
  if (raw === 'ml' || raw === 'mililitro' || raw === 'mililitros') return 'ml'

  // Gramos / kilos
  if (raw === 'g' || raw === 'gr' || raw === 'gramo' || raw === 'gramos') return 'g'
  if (raw === 'kg' || raw === 'kilo' || raw === 'kilos') return 'kg'

  return raw
}

function uniqueOrdered(list: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of list) {
    const v = normalizeWasteUnit(item)
    if (!seen.has(v)) {
      seen.add(v)
      out.push(v)
    }
  }
  return out
}

function isCountUnit(unit: string): boolean {
  return normalizeWasteUnit(unit) === 'ud'
}

function getStep(unit: string): number {
  if (isCountUnit(unit)) return 1
  const u = normalizeWasteUnit(unit)
  if (u === 'kg' || u === 'l') return 0.01
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
  raw,
  onRawChange,
  onBlur,
  ariaLabel,
  hideUnitSuffix,
}: {
  unit: string
  value: number
  onChange: (n: number) => void
  raw: string
  onRawChange: (s: string) => void
  onBlur: () => void
  ariaLabel: string
  hideUnitSuffix?: boolean
}) {
  const step = getStep(unit)
  const count = isCountUnit(unit)

  const adjust = (delta: number) => {
    const next = roundQty(Math.max(0, value + delta), unit)
    onChange(next)
    onRawChange(next === 0 ? '' : String(next))
  }

  return (
    <div
      className={cn(
        // Caja "cantidad" estilo desglose monetario (cierre de caja)
        'flex items-stretch justify-between w-full bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm',
        'min-h-[48px] focus-within:ring-2 focus-within:ring-[#36606F]/25 focus-within:border-[#36606F]/40',
      )}
    >
      <button
        type="button"
        onClick={() => adjust(-step)}
        className="w-7 shrink-0 flex items-center justify-center text-zinc-400 hover:bg-rose-50 hover:text-rose-600 active:bg-rose-100 transition-colors"
        aria-label={`Menos ${ariaLabel}`}
      >
        <Minus className="w-4 h-4" strokeWidth={3} />
      </button>
      <input
        type="text"
        inputMode={count ? 'numeric' : 'decimal'}
        value={raw}
        onChange={(e) => {
          const nextRaw = e.target.value
          onRawChange(nextRaw)
          onChange(parseQuantity(nextRaw, unit))
        }}
        onBlur={onBlur}
        className={cn(
          'flex-1 w-0 h-full bg-transparent text-center font-black tabular-nums outline-none p-0',
          'text-[10px] sm:text-[11px] text-zinc-700 tracking-tighter',
          'focus:bg-blue-50/20 transition-colors',
        )}
        aria-label={ariaLabel}
      />
      <button
        type="button"
        onClick={() => adjust(step)}
        className="w-7 shrink-0 flex items-center justify-center text-zinc-400 hover:bg-emerald-50 hover:text-emerald-600 active:bg-emerald-100 transition-colors"
        aria-label={`Más ${ariaLabel}`}
      >
        <Plus className="w-4 h-4" strokeWidth={3} />
      </button>
      {!hideUnitSuffix ? (
        <span className="pr-3 text-[10px] font-black text-zinc-500 w-10 text-center shrink-0 uppercase tracking-wide">
          {unit}
        </span>
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
    const base = [...WASTE_UNIT_PRESETS]
    const extras = uniqueOrdered([ingredientUnit, orderUnit ?? '', value].filter(Boolean) as string[])
    return uniqueOrdered([...base, ...extras])
  }, [ingredientUnit, orderUnit, value])

  const normalizedValue = normalizeWasteUnit(value || ingredientUnit || orderUnit || 'ud')

  return (
    <select
      value={normalizedValue}
      onChange={(e) => onChange(normalizeWasteUnit(e.target.value))}
      className={cn(
        'w-full min-h-[48px] rounded-xl border border-zinc-200 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wide text-zinc-700 shadow-sm',
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
  raw,
  onRawChange,
  onBlur,
}: {
  recipe: RecipeOption
  value: number
  onChange: (n: number) => void
  raw: string
  onRawChange: (s: string) => void
  onBlur: () => void
}) {
  return (
    <div className="relative flex flex-col bg-transparent rounded-2xl overflow-visible pt-12">
      <div className="absolute left-1/2 top-1 -translate-x-1/2 w-14 h-14 rounded-2xl bg-transparent flex items-center justify-center pointer-events-none">
        {recipe.photo_url ? (
          <img src={recipe.photo_url} alt="" className="h-12 w-12 object-contain" />
        ) : (
          <ChefHat className="w-8 h-8 text-zinc-200" strokeWidth={1.5} />
        )}
      </div>
      <div className="flex flex-col items-center px-2 pt-2 pb-1">
        <span
          className="text-[10px] min-[380px]:text-[11px] font-black text-zinc-800 leading-tight w-full text-center line-clamp-2"
          title={recipe.name}
        >
          {recipe.name}
        </span>
      </div>
      <div className="shrink-0 px-2 pb-2 pt-0 flex flex-col items-stretch w-full">
        <label className="sr-only">Cantidad merma {recipe.name}</label>
        <QuantityStepper
          unit="ud"
          value={value}
          onChange={onChange}
          raw={raw}
          onRawChange={onRawChange}
          onBlur={onBlur}
          ariaLabel={`Unidades ${recipe.name}`}
          hideUnitSuffix
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
  raw,
  onRawChange,
  onBlur,
  onUnitChange,
}: {
  item: Ingredient
  amount: number
  wasteUnit: string
  onAmountChange: (n: number) => void
  raw: string
  onRawChange: (s: string) => void
  onBlur: () => void
  onUnitChange: (u: string) => void
}) {
  return (
    <div className="relative flex flex-col bg-transparent rounded-2xl overflow-visible pt-12">
      <div className="absolute left-1/2 top-1 -translate-x-1/2 w-14 h-14 rounded-2xl bg-transparent flex items-center justify-center pointer-events-none">
        {item.image_url ? (
          <img src={item.image_url} alt="" className="h-12 w-12 object-contain" />
        ) : (
          <Package className="w-8 h-8 text-zinc-200" strokeWidth={1.5} />
        )}
      </div>
      <div className="flex flex-col items-center px-2 pt-2 pb-1">
        <span
          className="text-[10px] min-[380px]:text-[11px] font-black text-zinc-800 leading-tight w-full text-center line-clamp-2"
          title={item.name}
        >
          {item.name}
        </span>
      </div>
      <div className="shrink-0 px-2 pb-2 pt-0 flex flex-col gap-1.5 items-stretch w-full">
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
          raw={raw}
          onRawChange={onRawChange}
          onBlur={onBlur}
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
  const [recipeAmountRaw, setRecipeAmountRaw] = useState<Record<string, string>>({})
  const [recipeQuery, setRecipeQuery] = useState('')
  const [recipeCategory, setRecipeCategory] = useState<string | null>(null)
  const [recipeFilterOpen, setRecipeFilterOpen] = useState(false)

  const [amounts, setAmounts] = useState<Record<string, number>>({})
  const [amountsRaw, setAmountsRaw] = useState<Record<string, string>>({})
  const [ingredientQuery, setIngredientQuery] = useState('')
  const [ingredientCategory, setIngredientCategory] = useState<string | null>(null)
  const [ingredientFilterOpen, setIngredientFilterOpen] = useState(false)
  const [wasteUnits, setWasteUnits] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialIngredients.map((i) => [i.id, normalizeWasteUnit(i.unit)])),
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.scrollTo(0, 0)
  }, [])

  useEffect(() => {
    setWasteUnits((prev) => {
      const next = { ...prev }
      for (const i of initialIngredients) {
        const def = normalizeWasteUnit(i.unit)
        if (next[i.id] === undefined) next[i.id] = def
      }
      return next
    })
  }, [initialIngredients])

  useEffect(() => {
    if (!recipeFilterOpen && !ingredientFilterOpen) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest('[data-waste-filter-root="true"]')) return
      setRecipeFilterOpen(false)
      setIngredientFilterOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRecipeFilterOpen(false)
        setIngredientFilterOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [recipeFilterOpen, ingredientFilterOpen])

  const filteredRecipes = useMemo(() => {
    const s = recipeQuery.trim().toLowerCase()
    return recipes.filter((r) => {
      const okText = !s || r.name.toLowerCase().includes(s)
      const cat = (r.category ?? '').trim()
      const okCat = !recipeCategory || (cat && cat === recipeCategory)
      return okText && okCat
    })
  }, [recipes, recipeQuery, recipeCategory])

  const recipeCategories = useMemo(() => {
    const set = new Set<string>()
    for (const r of recipes) {
      const c = (r.category ?? '').trim()
      if (c) set.add(c)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
  }, [recipes])

  const grouped = useMemo(() => {
    const q = ingredientQuery.trim().toLowerCase()
    const list = initialIngredients.filter((i) => {
      const okText = !q || i.name.toLowerCase().includes(q)
      const okCat = !ingredientCategory || i.category === ingredientCategory
      return okText && okCat
    })
    return list.reduce(
      (acc, curr) => {
        ;(acc[curr.category] = acc[curr.category] || []).push(curr)
        return acc
      },
      {} as Record<string, Ingredient[]>,
    )
  }, [initialIngredients, ingredientQuery, ingredientCategory])

  const ingredientCategories = useMemo(() => {
    const set = new Set<string>()
    for (const i of initialIngredients) {
      const c = (i.category ?? '').trim()
      if (c) set.add(c)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
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
    <div className="flex flex-col gap-4 min-h-0 flex-1">
      <div className="flex flex-col gap-3 shrink-0">
        <p className="text-sm text-zinc-600">
          Registra aquí la <span className="font-semibold text-zinc-800">pérdida</span> de producto. Se guardará
          como movimiento tipo merma.
        </p>

        <div className="flex shrink-0 w-full justify-start">
          <div className="inline-flex rounded-lg overflow-hidden border border-[#36606F] shadow-sm max-w-full">
            <button
              type="button"
              onClick={() => {
                setMode('recipes')
                setAmounts({})
              }}
              className={cn(
                'px-3 py-2 min-h-[48px] h-auto inline-flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-colors outline-none whitespace-nowrap',
                mode === 'recipes'
                  ? 'bg-[#36606F] text-white'
                  : 'bg-white text-[#36606F] hover:bg-[#36606F]/5',
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
                'px-3 py-2 min-h-[48px] h-auto inline-flex items-center justify-center text-[10px] font-black uppercase tracking-widest transition-colors outline-none whitespace-nowrap',
                mode === 'ingredients'
                  ? 'bg-[#36606F] text-white'
                  : 'bg-white text-[#36606F] hover:bg-[#36606F]/5',
              )}
            >
              Ingredientes
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto pr-0.5">
        {mode === 'recipes' ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 w-full shrink-0 relative">
              <div className="relative w-full flex-1 min-w-0">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar receta…"
                  value={recipeQuery}
                  onChange={(e) => setRecipeQuery(e.target.value)}
                  className="w-full min-h-[48px] pl-10 pr-4 rounded-xl border border-zinc-200 bg-white text-sm font-medium text-zinc-800 shadow-sm outline-none focus:ring-2 focus:ring-[#36606F]/25 focus:border-[#36606F]/40"
                />
              </div>

              <div className="shrink-0 relative">
                <button
                  type="button"
                  onClick={() => {
                    setIngredientFilterOpen(false)
                    setRecipeFilterOpen((v) => !v)
                  }}
                  className={cn(
                    'min-h-[48px] min-w-[48px] flex items-center justify-center',
                    'rounded-xl border-0 bg-transparent hover:bg-zinc-100/60 active:bg-zinc-100 transition-colors',
                    recipeCategory ? 'text-[#36606F]' : 'text-zinc-400',
                  )}
                  aria-label="Filtrar recetas por categoría"
                  title="Filtrar"
                  data-waste-filter-root="true"
                >
                  <Filter className="w-5 h-5" strokeWidth={2.5} />
                </button>

                {recipeFilterOpen ? (
                  <div
                    className="absolute right-0 mt-2 w-64 rounded-2xl bg-white text-zinc-900 shadow-2xl border border-zinc-100 overflow-hidden z-20"
                    data-waste-filter-root="true"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setRecipeCategory(null)
                        setRecipeFilterOpen(false)
                      }}
                      className={cn(
                        'w-full min-h-12 px-4 py-3 flex items-center justify-between hover:bg-zinc-50 active:bg-zinc-100 transition-colors',
                        !recipeCategory && 'bg-zinc-50',
                      )}
                    >
                      <span className="text-[11px] font-black uppercase tracking-widest">Todas</span>
                      <span className="text-[10px] font-black text-zinc-400">{recipes.length}</span>
                    </button>
                    <div className="h-px bg-zinc-100" />
                    <div className="max-h-72 overflow-auto">
                      {recipeCategories.length === 0 ? (
                        <div className="px-4 py-3 text-xs font-bold text-zinc-400">Sin categorías</div>
                      ) : (
                        recipeCategories.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => {
                              setRecipeCategory(c)
                              setRecipeFilterOpen(false)
                            }}
                            className={cn(
                              'w-full min-h-12 px-4 py-3 text-left hover:bg-zinc-50 active:bg-zinc-100 transition-colors',
                              recipeCategory === c && 'bg-zinc-50',
                            )}
                          >
                            <span className="text-[11px] font-black uppercase tracking-widest text-zinc-700">
                              {c}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {filteredRecipes.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-8">No hay recetas que coincidan.</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 gap-2.5 sm:gap-6 items-start justify-items-stretch">
                {filteredRecipes.map((r) => (
                  <RecipeWasteCard
                    key={r.id}
                    recipe={r}
                    value={recipeAmounts[r.id] ?? 0}
                    raw={recipeAmountRaw[r.id] ?? (recipeAmounts[r.id] ? String(recipeAmounts[r.id]) : '')}
                    onRawChange={(s) => setRecipeAmountRaw((prev) => ({ ...prev, [r.id]: s }))}
                    onBlur={() => {
                      const u = 'ud'
                      const parsed = parseQuantity(recipeAmountRaw[r.id] ?? '', u)
                      setRecipeAmounts((prev) => ({ ...prev, [r.id]: parsed }))
                      setRecipeAmountRaw((prev) => ({ ...prev, [r.id]: parsed === 0 ? '' : String(parsed) }))
                    }}
                    onChange={(n) => setRecipeAmounts((prev) => ({ ...prev, [r.id]: n }))}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-2 w-full shrink-0 relative">
              <div className="relative w-full flex-1 min-w-0">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar ingrediente…"
                  value={ingredientQuery}
                  onChange={(e) => setIngredientQuery(e.target.value)}
                  className="w-full min-h-[48px] pl-10 pr-4 rounded-xl border border-zinc-200 bg-white text-sm font-medium text-zinc-800 shadow-sm outline-none focus:ring-2 focus:ring-[#36606F]/25 focus:border-[#36606F]/40"
                />
              </div>

              <div className="shrink-0 relative">
                <button
                  type="button"
                  onClick={() => {
                    setRecipeFilterOpen(false)
                    setIngredientFilterOpen((v) => !v)
                  }}
                  className={cn(
                    'min-h-[48px] min-w-[48px] flex items-center justify-center',
                    'rounded-xl border-0 bg-transparent hover:bg-zinc-100/60 active:bg-zinc-100 transition-colors',
                    ingredientCategory ? 'text-[#36606F]' : 'text-zinc-400',
                  )}
                  aria-label="Filtrar ingredientes por categoría"
                  title="Filtrar"
                  data-waste-filter-root="true"
                >
                  <Filter className="w-5 h-5" strokeWidth={2.5} />
                </button>

                {ingredientFilterOpen ? (
                  <div
                    className="absolute right-0 mt-2 w-64 rounded-2xl bg-white text-zinc-900 shadow-2xl border border-zinc-100 overflow-hidden z-20"
                    data-waste-filter-root="true"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setIngredientCategory(null)
                        setIngredientFilterOpen(false)
                      }}
                      className={cn(
                        'w-full min-h-12 px-4 py-3 flex items-center justify-between hover:bg-zinc-50 active:bg-zinc-100 transition-colors',
                        !ingredientCategory && 'bg-zinc-50',
                      )}
                    >
                      <span className="text-[11px] font-black uppercase tracking-widest">Todas</span>
                      <span className="text-[10px] font-black text-zinc-400">{initialIngredients.length}</span>
                    </button>
                    <div className="h-px bg-zinc-100" />
                    <div className="max-h-72 overflow-auto">
                      {ingredientCategories.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => {
                            setIngredientCategory(c)
                            setIngredientFilterOpen(false)
                          }}
                          className={cn(
                            'w-full min-h-12 px-4 py-3 text-left hover:bg-zinc-50 active:bg-zinc-100 transition-colors',
                            ingredientCategory === c && 'bg-zinc-50',
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

            {Object.keys(grouped).length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-8">No hay ingredientes que coincidan.</p>
            ) : (
              Object.entries(grouped).map(([category, items]) => (
                <section key={category} className="flex flex-col gap-3 shrink-0">
                  <div className="text-sm font-black uppercase tracking-wide text-zinc-500 px-0.5">{category}</div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 gap-2.5 sm:gap-6 items-start justify-items-stretch">
                    {items.map((item) => {
                      const wu = normalizeWasteUnit(wasteUnits[item.id] ?? item.unit)
                      const numeric = amounts[item.id] ?? 0
                      const fallbackRaw =
                        numeric === 0
                          ? ''
                          : String(numeric).length > 8
                            ? numeric.toFixed(4).replace(/\.?0+$/, '')
                            : String(numeric)
                      return (
                        <IngredientWasteCard
                          key={item.id}
                          item={item}
                          amount={numeric}
                          raw={amountsRaw[item.id] ?? fallbackRaw}
                          onRawChange={(s) => setAmountsRaw((prev) => ({ ...prev, [item.id]: s }))}
                          onBlur={() => {
                            const parsed = parseQuantity(amountsRaw[item.id] ?? '', wu)
                            setIngredientQty(item.id, wu, parsed)
                            setAmountsRaw((prev) => ({ ...prev, [item.id]: parsed === 0 ? '' : String(parsed) }))
                          }}
                          wasteUnit={wu}
                          onAmountChange={(n) => setIngredientQty(item.id, wu, n)}
                          onUnitChange={(newUnit) => {
                            const norm = normalizeWasteUnit(newUnit)
                            setWasteUnits((prev) => ({ ...prev, [item.id]: norm }))
                            setAmounts((prev) => ({
                              ...prev,
                              [item.id]: roundQty(prev[item.id] ?? 0, norm),
                            }))
                            setAmountsRaw((prev) => {
                              const next = { ...prev }
                              const now = roundQty(amounts[item.id] ?? 0, norm)
                              next[item.id] = now === 0 ? '' : String(now)
                              return next
                            })
                          }}
                        />
                      )
                    })}
                  </div>
                </section>
              ))
            )}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 left-0 right-0 shrink-0 bg-white pt-3 border-t border-zinc-100">
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
    </div>
  )
}
