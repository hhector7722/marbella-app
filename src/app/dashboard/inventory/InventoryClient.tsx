'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation';
import { processInventoryCounts, saveIngredientsInventoryVisibility } from './actions'
import { toast } from 'sonner'
import { AlertCircle, Filter, Package, Search } from 'lucide-react'
import { FloatingCalculatorFab, QuickCalculatorModal } from '@/components/ui/QuickCalculatorModal'
import { Button } from '@/components/ui/button'
import { QuantityStepper } from '@/components/ui/QuantityStepper'
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

export type ManagerIngredientRow = Ingredient & {
  inventory_visible: boolean
}

interface InventoryClientProps {
  initialIngredients: Ingredient[]
  /** Solo gerencia: si no hay artículos visibles, muestra ayuda para el icono de edición. */
  managerEmptyHint?: boolean
  managerFullList?: ManagerIngredientRow[]
  visibilityEditMode?: boolean
  onCloseVisibilityEditMode?: () => void
}

function abbreviateLabel(name: string, maxChars = 22): string {
  const t = name.replace(/\s+/g, ' ').trim()
  if (t.length <= maxChars) return t
  const cut = Math.max(8, maxChars - 1)
  return `${t.slice(0, cut)}…`
}

function normalizeUnit(unit: string | null | undefined): string {
  const raw = (unit ?? '').trim().toLowerCase()
  if (!raw) return 'ud'
  if (raw === 'ud' || raw === 'u' || raw === 'un' || raw === 'unidad' || raw === 'unidades') return 'ud'
  if (raw === 'l' || raw === 'lt' || raw === 'litro' || raw === 'litros') return 'l'
  if (raw === 'ml' || raw === 'mililitro' || raw === 'mililitros') return 'ml'
  if (raw === 'g' || raw === 'gr' || raw === 'gramo' || raw === 'gramos') return 'g'
  if (raw === 'kg' || raw === 'kilo' || raw === 'kilos') return 'kg'
  return raw
}

function isCountUnit(unit: string): boolean {
  return normalizeUnit(unit) === 'ud'
}

function getStep(unit: string): number {
  if (isCountUnit(unit)) return 1
  const u = normalizeUnit(unit)
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

function InventoryIngredientCard({
  item,
  raw,
  onRawChange,
  onBlur,
  onNumericChange,
  numeric,
  visibilityMode,
  visibilityOn,
  onVisibilityToggle,
  totalBothLocations,
}: {
  item: Ingredient
  raw: string
  onRawChange: (s: string) => void
  onBlur: () => void
  onNumericChange: (n: number) => void
  numeric: number
  visibilityMode: boolean
  visibilityOn: boolean
  onVisibilityToggle: () => void
  totalBothLocations?: number
}) {
  const u = normalizeUnit(item.unit)
  const label = abbreviateLabel(item.name)

  return (
    <div
      className={cn('flex h-full min-h-0 flex-col rounded-xl bg-white overflow-hidden')}
    >
      <div className="relative shrink-0 h-14 w-full flex items-center justify-center bg-zinc-50/40">
        {visibilityMode && (
          <button
            type="button"
            role="switch"
            aria-checked={visibilityOn}
            onClick={(e) => {
              e.stopPropagation()
              onVisibilityToggle()
            }}
            className={cn(
              'absolute top-0.5 right-0.5 z-10 flex min-h-[40px] min-w-[3.75rem] items-center rounded-full p-1 transition-colors shadow-sm',
              visibilityOn ? 'bg-emerald-600 justify-end' : 'bg-zinc-300/90 justify-start',
            )}
            title={visibilityOn ? 'Visible en inventario' : 'Oculto en inventario'}
          >
            <span className="h-8 w-8 max-h-full aspect-square rounded-full bg-white shadow-md shrink-0 pointer-events-none" />
          </button>
        )}
        {item.image_url ? (
          <img src={item.image_url} alt="" className="h-12 w-12 object-contain" />
        ) : (
          <Package className="w-8 h-8 text-zinc-200" strokeWidth={1.5} />
        )}
      </div>
      <div className="shrink-0 h-10 px-2 flex flex-col items-center justify-center min-w-0 gap-0.5">
        <span
          className="w-full min-w-0 text-center text-[10px] min-[380px]:text-[11px] font-black text-zinc-800 whitespace-nowrap overflow-hidden text-ellipsis"
          title={item.name}
        >
          {label}
        </span>
      </div>
      {!visibilityMode && (
        <div className="mt-auto shrink-0 px-2 pb-2 pt-0 flex flex-col items-stretch w-full">
          <label className="sr-only">Cantidad contada {item.name}</label>
          <QuantityStepper
            value={numeric}
            onChange={(n) => onNumericChange(roundQty(n, u))}
            raw={raw}
            onRawChange={onRawChange}
            onBlur={onBlur}
            step={getStep(u)}
            inputMode={isCountUnit(u) ? 'numeric' : 'decimal'}
            ariaLabel={`Cantidad contada ${item.name}`}
            bottomText={totalBothLocations !== undefined ? `Total ${totalBothLocations}` : undefined}
          />
        </div>
      )}
    </div>
  )
}

export function InventoryClient({
  initialIngredients,
  managerEmptyHint = false,
  managerFullList,
  visibilityEditMode = false,
  onCloseVisibilityEditMode,
}: InventoryClientProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [savingVisibility, setSavingVisibility] = useState(false)
  const [physicalCountsBarra, setPhysicalCountsBarra] = useState<Record<string, string>>({})
  const [numericByIdBarra, setNumericByIdBarra] = useState<Record<string, number>>({})
  const [physicalCountsCamara, setPhysicalCountsCamara] = useState<Record<string, string>>({})
  const [numericByIdCamara, setNumericByIdCamara] = useState<Record<string, number>>({})
  const [locationMode, setLocationMode] = useState<'BARRA' | 'CAMARA'>('BARRA')
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false)
  const [draftVisibility, setDraftVisibility] = useState<Record<string, boolean>>({})

  const [ingredientQuery, setIngredientQuery] = useState('')
  const [ingredientCategory, setIngredientCategory] = useState<string | null>(null)
  const [ingredientFilterOpen, setIngredientFilterOpen] = useState(false)

  const sourceList: Ingredient[] = useMemo(() => {
    if (visibilityEditMode && managerFullList && managerFullList.length > 0) {
      return managerFullList
    }
    return initialIngredients
  }, [visibilityEditMode, managerFullList, initialIngredients])

  useEffect(() => {
    if (!visibilityEditMode || !managerFullList?.length) return
    const next: Record<string, boolean> = {}
    for (const row of managerFullList) {
      next[row.id] = row.inventory_visible !== false
    }
    setDraftVisibility(next)
  }, [visibilityEditMode, managerFullList])

  useEffect(() => {
    if (!ingredientFilterOpen) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest('[data-inventory-filter-root="true"]')) return
      setIngredientFilterOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIngredientFilterOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [ingredientFilterOpen])

  const ingredientCategories = useMemo(() => {
    const set = new Set<string>()
    for (const i of sourceList) {
      const c = (i.category ?? '').trim()
      if (c) set.add(c)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
  }, [sourceList])

  const grouped = useMemo(() => {
    const q = ingredientQuery.trim().toLowerCase()
    const list = sourceList.filter((i) => {
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
  }, [sourceList, ingredientQuery, ingredientCategory])

  const setQty = (id: string, item: Ingredient, n: number) => {
    const u = normalizeUnit(item.unit)
    const rounded = roundQty(n, u)
    if (locationMode === 'BARRA') {
      setNumericByIdBarra((prev) => ({ ...prev, [id]: rounded }))
    } else {
      setNumericByIdCamara((prev) => ({ ...prev, [id]: rounded }))
    }
  }

  const toggleDraftVisibility = (id: string) => {
    setDraftVisibility((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const handleSaveVisibility = async () => {
    if (!managerFullList?.length) return
    const updates = managerFullList
      .filter((row) => {
        const before = row.inventory_visible !== false
        const after = draftVisibility[row.id] ?? before
        return before !== after
      })
      .map((row) => ({
        ingredient_id: row.id,
        inventory_visible: draftVisibility[row.id] ?? (row.inventory_visible !== false),
      }))

    if (updates.length === 0) {
      toast.message('Sin cambios que guardar.')
      return
    }

    setSavingVisibility(true)
    try {
      await saveIngredientsInventoryVisibility(updates)
      toast.success('Lista de inventario actualizada.')
      onCloseVisibilityEditMode?.()
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar.')
    } finally {
      setSavingVisibility(false)
    }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      const payload = initialIngredients
        .map((item) => {
          const u = normalizeUnit(item.unit)
          const valBarra = numericByIdBarra[item.id]
          const valCamara = numericByIdCamara[item.id]
          if (valBarra === undefined && valCamara === undefined) return null
          
          const total = (valBarra ?? 0) + (valCamara ?? 0)
          const safePhysical = roundQty(Number.isFinite(total) ? total : 0, u)
          return {
            ingredient_id: item.id,
            physical_stock: safePhysical,
            theoretical_stock: item.stock_current,
            unit: item.unit || 'ud',
          }
        })
        .filter(Boolean) as {
          ingredient_id: string
          physical_stock: number
          theoretical_stock: number
          unit: string
        }[]

      if (payload.length === 0) {
        toast.error('Indica al menos una cantidad contada.')
        return
      }

      const res = await processInventoryCounts(payload)
      if (res.success) {
        toast.success(res.message)
        setPhysicalCountsBarra({})
        setNumericByIdBarra({})
        setPhysicalCountsCamara({})
        setNumericByIdCamara({})
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Error al procesar el recuento.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const hasAnyCount = useMemo(
    () => Object.keys(numericByIdBarra).length > 0 || Object.keys(numericByIdCamara).length > 0,
    [numericByIdBarra, numericByIdCamara],
  )

  const submitDisabled = isSubmitting || !hasAnyCount

  const countForFilterTotal = sourceList.length

  if (!visibilityEditMode && initialIngredients.length === 0) {
    return (
      <div className="flex flex-col gap-3 min-h-0 flex-1 items-center justify-center py-12 px-2 text-center">
        <p className="text-sm font-medium text-zinc-600">No hay artículos visibles en el recuento.</p>
        {managerEmptyHint ? (
          <p className="text-xs text-zinc-500 max-w-sm">
            Pulsa el icono de edición en la cabecera para activar artículos en esta pantalla.
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 min-h-0 flex-1">
      <div className="flex-1 min-h-0 pr-0.5">
        <div className="flex flex-col gap-6 relative">
          <div className="sticky top-0 z-30 bg-zinc-50/95 backdrop-blur-sm pb-4 pt-1 flex flex-col gap-3 -mx-2 px-2 border-b border-zinc-200/50">
            {!visibilityEditMode && (
              <div className="flex items-center gap-2 w-full shrink-0">
                <div className="flex flex-1 bg-zinc-100 p-1 rounded-xl shrink-0 min-h-[48px] items-center min-w-0">
                  <button
                    type="button"
                    onClick={() => setLocationMode('BARRA')}
                    className={cn(
                      'flex-1 px-1 sm:px-2 py-2 rounded-lg text-[11px] sm:text-xs font-black uppercase tracking-wider transition-all min-h-[40px] truncate',
                      locationMode === 'BARRA'
                        ? 'bg-white text-[#36606F] shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50'
                    )}
                  >
                    BARRA
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocationMode('CAMARA')}
                    className={cn(
                      'flex-1 px-1 sm:px-2 py-2 rounded-lg text-[11px] sm:text-xs font-black uppercase tracking-wider transition-all min-h-[40px] truncate',
                      locationMode === 'CAMARA'
                        ? 'bg-white text-[#36606F] shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50'
                    )}
                  >
                    CÁMARA
                  </button>
                </div>
                
                <Button
                  type="button"
                  variant="primary"
                  instance="inventory-save-count"
                  onClick={handleSubmit}
                  disabled={submitDisabled}
                  loading={isSubmitting}
                >
                  Guardar recuento
                </Button>
              </div>
            )}

            <div className="flex items-center gap-2 w-full shrink-0 relative z-20">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar ingrediente…"
                  value={ingredientQuery}
                  onChange={(e) => setIngredientQuery(e.target.value)}
                  className="w-full min-h-[48px] pl-10 pr-4 rounded-xl border border-zinc-200 bg-white text-sm font-medium text-zinc-800 shadow-sm outline-none focus:ring-2 focus:ring-[#36606F]/25 focus:border-[#36606F]/40"
                />
              </div>

              {visibilityEditMode && managerFullList?.length ? (
                <Button
                  type="button"
                  variant="primary"
                  instance="inventory-save-visibility"
                  onClick={handleSaveVisibility}
                  disabled={savingVisibility}
                  loading={savingVisibility}
                >
                  Guardar lista
                </Button>
              ) : null}

              <div className="shrink-0 relative" data-inventory-filter-root="true">
                <Button
                  type="button"
                  variant="tertiary"
                  instance="inventory-filter-category"
                  onClick={() => setIngredientFilterOpen((v) => !v)}
                  icon={<Filter className="w-5 h-5" strokeWidth={2.5} />}
                  aria-label="Filtrar por categoría"
                  className="shrink-0"
                />

                {ingredientFilterOpen ? (
                  <div
                    className="absolute right-0 mt-2 w-64 rounded-2xl bg-white text-zinc-900 shadow-2xl border border-zinc-100 overflow-hidden z-20"
                    data-inventory-filter-root="true"
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
                      <span className="text-[10px] font-black text-zinc-400">{countForFilterTotal}</span>
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
          </div>

        {Object.keys(grouped).length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-8">No hay ingredientes que coincidan.</p>
          ) : (
            Object.entries(grouped).map(([category, items]) => (
              <section key={category} className="flex flex-col gap-3 shrink-0">
                <div className="text-sm font-black uppercase tracking-wide text-zinc-500 px-0.5">{category}</div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 gap-2.5 sm:gap-6 items-stretch justify-items-stretch">
                  {items.map((item) => {
                    const u = normalizeUnit(item.unit)
                    const isBarra = locationMode === 'BARRA'
                    const counted = isBarra ? numericByIdBarra[item.id] : numericByIdCamara[item.id]
                    const numeric = counted ?? 0
                    
                    const valB = numericByIdBarra[item.id]
                    const valC = numericByIdCamara[item.id]
                    let totalBothLocations: number | undefined
                    if (valB !== undefined && valB >= 1 && valC !== undefined && valC >= 1) {
                      totalBothLocations = valB + valC
                    }

                    const rawCounts = isBarra ? physicalCountsBarra : physicalCountsCamara
                    const raw =
                      rawCounts[item.id] !== undefined
                        ? rawCounts[item.id]!
                        : counted === undefined
                          ? ''
                          : String(counted)
                    const visibilityOn =
                      draftVisibility[item.id] ??
                      (item as ManagerIngredientRow).inventory_visible !== false

                    return (
                      <InventoryIngredientCard
                        key={item.id}
                        item={item}
                        numeric={numeric}
                        raw={raw}
                        visibilityMode={Boolean(visibilityEditMode && managerFullList?.length)}
                        visibilityOn={visibilityOn}
                        totalBothLocations={totalBothLocations}
                        onVisibilityToggle={() => toggleDraftVisibility(item.id)}
                        onRawChange={(s) => {
                          const setPhysical = isBarra ? setPhysicalCountsBarra : setPhysicalCountsCamara
                          const setNumeric = isBarra ? setNumericByIdBarra : setNumericByIdCamara
                          setPhysical((prev) => ({ ...prev, [item.id]: s }))
                          if (s.trim() === '') {
                            setNumeric((prev) => {
                              const next = { ...prev }
                              delete next[item.id]
                              return next
                            })
                          } else {
                            setQty(item.id, item, parseQuantity(s, u))
                          }
                        }}
                        onBlur={() => {
                          const rawCountsRef = isBarra ? physicalCountsBarra : physicalCountsCamara
                          const setPhysical = isBarra ? setPhysicalCountsBarra : setPhysicalCountsCamara
                          const setNumeric = isBarra ? setNumericByIdBarra : setNumericByIdCamara
                          
                          const rawStr = rawCountsRef[item.id] ?? ''
                          if (rawStr.trim() === '') {
                            setNumeric((prev) => {
                              const next = { ...prev }
                              delete next[item.id]
                              return next
                            })
                            setPhysical((prev) => {
                              const next = { ...prev }
                              delete next[item.id]
                              return next
                            })
                            return
                          }
                          const parsed = parseQuantity(rawStr, u)
                          setQty(item.id, item, parsed)
                          setPhysical((prev) => {
                            const next = { ...prev }
                            delete next[item.id]
                            return next
                          })
                        }}
                        onNumericChange={(n) => setQty(item.id, item, n)}
                      />
                    )
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </div>

      {!visibilityEditMode && (
        <>
          <FloatingCalculatorFab
            isOpen={isCalculatorOpen}
            onToggle={() => setIsCalculatorOpen(true)}
          />
          <QuickCalculatorModal
            isOpen={isCalculatorOpen}
            onClose={() => setIsCalculatorOpen(false)}
          />
        </>
      )}
    </div>
  )
}
