'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation';
import { processInventoryCounts, saveIngredientsInventoryVisibility } from './actions'
import { toast } from 'sonner'
import { Filter, Package } from 'lucide-react'
import { QuickCashTools } from '@/components/ui/QuickCalculatorModal'
import { Button } from '@/components/ui/button'
import { PetroleumSegmented } from '@/components/ui/PetroleumSegmented'
import { QuantityStepper } from '@/components/ui/QuantityStepper'
import { EmptyState } from '@/components/ui/EmptyState'
import { SearchField } from '@/components/ui/SearchField'
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import {
  clearInventoryDraft,
  hasInventoryDraftContent,
  readInventoryDraft,
  writeInventoryDraft,
} from '@/lib/inventory-draft'
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
  /** Usuario con sesión: da identidad al borrador local del recuento. */
  userId?: string | null
  /** Solo gerencia: si no hay artículos visibles, muestra ayuda para el icono de edición. */
  managerEmptyHint?: boolean
  managerFullList?: ManagerIngredientRow[]
  visibilityEditMode?: boolean
  onCloseVisibilityEditMode?: () => void
  /** Acción de cabecera (p. ej. editar lista visible). */
  rightSlot?: ReactNode
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

function InventoryProductCard({
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
      data-element="inventory-product-card"
      className="relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-md transition-shadow"
    >
      {visibilityMode ? (
        <button
          type="button"
          role="switch"
          aria-checked={visibilityOn}
          onClick={(e) => {
            e.stopPropagation()
            onVisibilityToggle()
          }}
          className={cn(
            'absolute right-1.5 top-1.5 z-10 flex min-h-[48px] min-w-[4.5rem] items-center rounded-full p-1 shadow-sm transition-colors',
            visibilityOn ? 'justify-end bg-emerald-600' : 'justify-start bg-zinc-300/90',
          )}
          title={visibilityOn ? 'Visible en inventario' : 'Oculto en inventario'}
        >
          <span className="h-9 w-9 max-h-full aspect-square shrink-0 rounded-full bg-white shadow-md pointer-events-none" />
        </button>
      ) : null}

      <div className="flex shrink-0 flex-col items-center justify-start bg-white px-1.5 pb-1 pt-1.5">
        <div className="mb-0.5 flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg bg-white">
          {item.image_url ? (
            <img src={item.image_url} className="h-full w-full object-contain" alt="" />
          ) : (
            <Package className="h-5 w-5 text-zinc-200" strokeWidth={1.5} />
          )}
        </div>
        <div className="flex w-full min-w-0 flex-col items-center gap-0.5 text-center">
          <span
            className="w-full min-w-0 truncate text-center text-[10px] min-[380px]:text-[11px] font-black leading-tight text-zinc-800"
            title={item.name}
          >
            {label}
          </span>
          <span className="w-full truncate text-center text-[10px] font-bold uppercase tracking-widest text-zinc-400">
            {u}
          </span>
        </div>
      </div>

      {!visibilityMode ? (
        <div className="mt-auto shrink-0 px-2 pb-2 pt-1">
          <QuantityStepper
            value={numeric}
            raw={raw}
            onRawChange={onRawChange}
            onBlur={onBlur}
            onChange={(n) => onNumericChange(roundQty(n, u))}
            step={getStep(u)}
            inputMode={isCountUnit(u) ? 'numeric' : 'decimal'}
            ariaLabel={`Cantidad contada ${item.name}`}
            bottomText={totalBothLocations !== undefined ? `Total ${totalBothLocations}` : undefined}
          />
        </div>
      ) : null}
    </div>
  )
}

export function InventoryClient({
  initialIngredients,
  userId = null,
  managerEmptyHint = false,
  managerFullList,
  visibilityEditMode = false,
  onCloseVisibilityEditMode,
  rightSlot,
}: InventoryClientProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [savingVisibility, setSavingVisibility] = useState(false)
  const [physicalCountsBarra, setPhysicalCountsBarra] = useState<Record<string, string>>({})
  const [numericByIdBarra, setNumericByIdBarra] = useState<Record<string, number>>({})
  const [physicalCountsCamara, setPhysicalCountsCamara] = useState<Record<string, string>>({})
  const [numericByIdCamara, setNumericByIdCamara] = useState<Record<string, number>>({})
  const [locationMode, setLocationMode] = useState<'BARRA' | 'CAMARA'>('BARRA')
  const [draftVisibility, setDraftVisibility] = useState<Record<string, boolean>>({})

  const [ingredientQuery, setIngredientQuery] = useState('')
  const [ingredientCategory, setIngredientCategory] = useState<string | null>(null)
  const [ingredientFilterOpen, setIngredientFilterOpen] = useState(false)

  // Borrador por usuario en el dispositivo: restaura al montar y se guarda en
  // cada cambio. Solo se borra al certificar el recuento (handleSubmit).
  const [draftSyncedFor, setDraftSyncedFor] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    const draft = readInventoryDraft(userId)
    /* eslint-disable react-hooks/set-state-in-effect -- restauración inicial desde localStorage (sistema externo) */
    setPhysicalCountsBarra(draft?.physicalCountsBarra ?? {})
    setNumericByIdBarra(draft?.numericByIdBarra ?? {})
    setPhysicalCountsCamara(draft?.physicalCountsCamara ?? {})
    setNumericByIdCamara(draft?.numericByIdCamara ?? {})
    setDraftSyncedFor(userId)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [userId])

  useEffect(() => {
    if (!userId || draftSyncedFor !== userId) return
    const draft = {
      physicalCountsBarra,
      numericByIdBarra,
      physicalCountsCamara,
      numericByIdCamara,
    }
    if (hasInventoryDraftContent(draft)) writeInventoryDraft(userId, draft)
    else clearInventoryDraft(userId)
  }, [
    userId,
    draftSyncedFor,
    physicalCountsBarra,
    numericByIdBarra,
    physicalCountsCamara,
    numericByIdCamara,
  ])

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
        clearInventoryDraft(userId)
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

  const catalog = (
    <div className="flex flex-col gap-5">
      {Object.keys(grouped).length === 0 ? (
        visibilityEditMode ? (
          <EmptyState
            instance="inventory-no-visible-edit"
            variant="none"
            title="No hay artículos en el inventario."
            description={managerEmptyHint ? 'Activa artículos para que aparezcan en el recuento.' : undefined}
          />
        ) : (
          <EmptyState
            instance="inventory-mismatch"
            variant="mismatch"
            title="No hay ingredientes que coincidan."
          />
        )
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <section key={category} className="flex flex-col gap-3">
            {category ? (
              <div className="px-0.5 text-sm font-black uppercase tracking-wide text-zinc-500">{category}</div>
            ) : null}
            <div className="grid grid-cols-3 gap-x-5 gap-y-6 pt-2 sm:grid-cols-4 sm:gap-x-6 sm:gap-y-8 md:grid-cols-5 md:gap-x-7 lg:grid-cols-5 lg:gap-x-5 lg:gap-y-6 xl:grid-cols-6 2xl:grid-cols-7">
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
                  <InventoryProductCard
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
      <div className="scroll-end-touch-cards" aria-hidden />
    </div>
  )

  const toolbar = (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-center gap-2">
        {!visibilityEditMode ? (
          <PetroleumSegmented
            instance="inventory-location"
            density="comfortable"
            aria-label="Ubicación del recuento"
            value={locationMode}
            onChange={(next) => setLocationMode(next as 'BARRA' | 'CAMARA')}
            options={[
              { value: 'BARRA', label: 'Barra' },
              { value: 'CAMARA', label: 'Cámara' },
            ]}
          />
        ) : null}

        {visibilityEditMode && managerFullList?.length ? (
          <Button
            type="button"
            variant="primary"
            instance="inventory-save-visibility"
            onClick={handleSaveVisibility}
            disabled={savingVisibility}
            loading={savingVisibility}
            className="shrink-0"
          >
            Guardar lista
          </Button>
        ) : null}

        {!visibilityEditMode ? (
          <Button
            type="button"
            variant="primary"
            instance="inventory-save-count"
            onClick={handleSubmit}
            disabled={submitDisabled}
            loading={isSubmitting}
            className="ml-auto shrink-0"
          >
            Guardar recuento
          </Button>
        ) : null}
      </div>

      <div className="flex min-w-0 w-full shrink-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <SearchField
            instance="inventory-search"
            placeholder="Buscar ingrediente…"
            value={ingredientQuery}
            onChange={setIngredientQuery}
          />
        </div>

        <div className="relative shrink-0" data-inventory-filter-root="true">
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
              className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-2xl border border-zinc-100 bg-white text-zinc-900 shadow-2xl"
              data-inventory-filter-root="true"
            >
              <button
                type="button"
                onClick={() => {
                  setIngredientCategory(null)
                  setIngredientFilterOpen(false)
                }}
                className={cn(
                  'flex min-h-12 w-full items-center justify-between px-4 py-3 transition-colors hover:bg-zinc-50 active:bg-zinc-100',
                  !ingredientCategory && 'bg-zinc-50',
                )}
              >
                <span className="text-[11px] font-black uppercase tracking-widest">Todas</span>
                <span className="text-[10px] font-black text-zinc-400">{sourceList.length}</span>
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
                      'min-h-12 w-full px-4 py-3 text-left transition-colors hover:bg-zinc-50 active:bg-zinc-100',
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
  )

  if (!visibilityEditMode && initialIngredients.length === 0) {
    return (
      <DashboardDetailLayout
        title="Ingredientes"
        subtitle="Recuento de existencias por ubicación"
        maxWidthClass="max-w-7xl"
        showBackButton={false}
        rightSlot={rightSlot}
        toolbarSlot={toolbar}
      >
        <EmptyState
          instance="inventory-no-visible"
          variant="none"
          title="No hay artículos visibles en el recuento."
          description={
            managerEmptyHint
              ? 'Pulsa el icono de edición en la cabecera para activar artículos en esta pantalla.'
              : undefined
          }
        />
      </DashboardDetailLayout>
    )
  }

  return (
    <DashboardDetailLayout
      title="Ingredientes"
      subtitle={visibilityEditMode ? 'Activa o desactiva artículos del recuento' : 'Recuento de existencias por ubicación'}
      maxWidthClass="max-w-7xl"
      showBackButton={false}
      rightSlot={rightSlot}
      toolbarSlot={toolbar}
    >
      {catalog}
      {!visibilityEditMode ? <QuickCashTools calculator /> : null}
    </DashboardDetailLayout>
  )
}
