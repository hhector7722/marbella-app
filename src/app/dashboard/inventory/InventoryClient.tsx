'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation';
import { processInventoryCounts, saveIngredientsInventoryVisibility } from './actions'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { Filter, Package, Trash2 } from 'lucide-react'
import { QuickCashTools } from '@/components/ui/QuickCalculatorModal'
import { Button } from '@/components/ui/button'
import { PetroleumSegmented } from '@/components/ui/PetroleumSegmented'
import { QuantityStepper } from '@/components/ui/QuantityStepper'
import { EmptyState } from '@/components/ui/EmptyState'
import { SearchField } from '@/components/ui/SearchField'
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
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
  /** Gerencia: recuentos pendientes de certificar (0 = sin pendientes). */
  pendingCount?: number
  /** Gerencia: abre el panel de recuentos pendientes. */
  onOpenPending?: () => void
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
  onClear,
  numeric,
  visibilityMode,
  visibilityOn,
  onVisibilityToggle,
}: {
  item: Ingredient
  raw: string
  onRawChange: (s: string) => void
  onBlur: () => void
  onNumericChange: (n: number) => void
  onClear: () => void
  numeric: number
  visibilityMode: boolean
  visibilityOn: boolean
  onVisibilityToggle: () => void
}) {
  const u = normalizeUnit(item.unit)

  return (
    <div
      data-element="inventory-product-card"
      className="relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-md transition-all hover:shadow-lg hover:-translate-y-0.5"
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
            className="w-full min-w-0 truncate text-center text-[9px] min-[380px]:text-[10px] font-black leading-tight text-zinc-800"
            title={item.name}
          >
            {item.name}
          </span>
          <span className="w-full truncate text-center text-[7.5px] font-bold uppercase tracking-widest text-zinc-400">
            {u}
          </span>
        </div>
      </div>

      {!visibilityMode ? (
        <QuantityStepper
          variant="bar"
          className="mt-auto"
          value={numeric}
          raw={raw}
          onRawChange={onRawChange}
          onBlur={onBlur}
          onChange={(n) => onNumericChange(roundQty(n, u))}
          step={getStep(u)}
          inputMode={isCountUnit(u) ? 'numeric' : 'decimal'}
          ariaLabel={`Cantidad contada ${item.name}`}
        />
      ) : null}

      {!visibilityMode && numeric > 0 ? (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Quitar ${item.name} del recuento`}
          className="absolute right-1.5 top-1.5 z-30 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-rose-500 shadow-sm backdrop-blur transition-all hover:bg-rose-50 sm:h-7 sm:w-7"
        >
          <Trash2 size={14} />
        </button>
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
  pendingCount = 0,
  onOpenPending,
}: InventoryClientProps) {
  const router = useRouter()
  const supabase = createClient()
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

  // Borrador compartido en servidor (como pedidos): lo que apunta cualquiera lo
  // ven los demás en vivo y persiste aunque se salga de la pantalla. Se vacía
  // al guardar o al pulsar «Nuevo».
  const lastSeenRef = useRef<{ barra: Record<string, number>; camara: Record<string, number> }>({
    barra: {},
    camara: {},
  })
  const dirtyIdsRef = useRef<Set<string>>(new Set())
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftReadyRef = useRef(false)
  const remoteApplyRef = useRef(false)

  const flushDrafts = useCallback(async () => {
    if (!userId || dirtyIdsRef.current.size === 0) return
    const ids = Array.from(dirtyIdsRef.current)
    dirtyIdsRef.current.clear()
    const { barra, camara } = lastSeenRef.current
    const upserts: {
      ingredient_id: string
      quantity_barra: number
      quantity_camara: number
      updated_by: string
      updated_at: string
    }[] = []
    const deletes: string[] = []
    for (const id of ids) {
      const b = barra[id] ?? 0
      const c = camara[id] ?? 0
      if (b === 0 && c === 0) {
        deletes.push(id)
      } else {
        upserts.push({
          ingredient_id: id,
          quantity_barra: b,
          quantity_camara: c,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        })
      }
    }
    try {
      if (upserts.length > 0) {
        await supabase.from('inventory_count_drafts').upsert(upserts)
      }
      if (deletes.length > 0) {
        await supabase.from('inventory_count_drafts').delete().in('ingredient_id', deletes)
      }
    } catch (error) {
      console.error('No se pudo guardar el borrador de inventario', error)
    }
  }, [supabase, userId])

  // Detecta cambios locales (nunca los aplicados por realtime) y los sincroniza
  // al servidor con retardo, como el borrador de pedidos.
  useEffect(() => {
    const prev = lastSeenRef.current
    const next = { barra: numericByIdBarra, camara: numericByIdCamara }
    lastSeenRef.current = next
    if (remoteApplyRef.current) {
      remoteApplyRef.current = false
      return
    }
    if (!draftReadyRef.current) return
    const changed = new Set<string>()
    for (const id of new Set([...Object.keys(prev.barra), ...Object.keys(next.barra)])) {
      if ((prev.barra[id] ?? 0) !== (next.barra[id] ?? 0)) changed.add(id)
    }
    for (const id of new Set([...Object.keys(prev.camara), ...Object.keys(next.camara)])) {
      if ((prev.camara[id] ?? 0) !== (next.camara[id] ?? 0)) changed.add(id)
    }
    if (changed.size === 0) return
    changed.forEach((id) => dirtyIdsRef.current.add(id))
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(() => {
      void flushDrafts()
    }, 600)
  }, [numericByIdBarra, numericByIdCamara, flushDrafts])

  const clearSharedDraft = useCallback(async () => {
    dirtyIdsRef.current.clear()
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    try {
      await supabase
        .from('inventory_count_drafts')
        .delete()
        .neq('ingredient_id', '00000000-0000-0000-0000-000000000000')
    } catch (error) {
      console.error('No se pudo vaciar el borrador de inventario', error)
    }
  }, [supabase])

  // Carga inicial del borrador compartido.
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const load = async () => {
      const { data } = await supabase
        .from('inventory_count_drafts')
        .select('ingredient_id, quantity_barra, quantity_camara')
      if (cancelled) return
      const barra: Record<string, number> = {}
      const camara: Record<string, number> = {}
      for (const row of data ?? []) {
        const b = Number(row.quantity_barra) || 0
        const c = Number(row.quantity_camara) || 0
        if (b !== 0) barra[row.ingredient_id] = b
        if (c !== 0) camara[row.ingredient_id] = c
      }
      remoteApplyRef.current = true
      setNumericByIdBarra(barra)
      setNumericByIdCamara(camara)
      draftReadyRef.current = true
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [supabase, userId])

  // Realtime: el borrador es compartido, cualquiera ve lo que apuntan los demás.
  useEffect(() => {
    if (!userId) return
    const removeKey = (prev: Record<string, number>, id: string) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    }
    const applyValue = (prev: Record<string, number>, id: string, value: number) => {
      if (value === 0) return removeKey(prev, id)
      if (prev[id] === value) return prev
      return { ...prev, [id]: value }
    }
    const channel = supabase
      .channel('inventory_count_drafts_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_count_drafts' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = (payload.old as { ingredient_id?: string }).ingredient_id
            if (!id) return
            remoteApplyRef.current = true
            setNumericByIdBarra((prev) => removeKey(prev, id))
            setNumericByIdCamara((prev) => removeKey(prev, id))
            return
          }
          const row = payload.new as {
            ingredient_id: string
            quantity_barra: number | string
            quantity_camara: number | string
          }
          const b = Number(row.quantity_barra) || 0
          const c = Number(row.quantity_camara) || 0
          remoteApplyRef.current = true
          setNumericByIdBarra((prev) => applyValue(prev, row.ingredient_id, b))
          setNumericByIdCamara((prev) => applyValue(prev, row.ingredient_id, c))
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase, userId])

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
        await clearSharedDraft()
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Error al procesar el recuento.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleNew = async () => {
    setPhysicalCountsBarra({})
    setNumericByIdBarra({})
    setPhysicalCountsCamara({})
    setNumericByIdCamara({})
    await clearSharedDraft()
    toast.success('Recuento vaciado.')
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
              <div className="px-0.5 text-sm font-black uppercase tracking-wide text-ds-texto-invertido">{category}</div>
            ) : null}
            <div className="grid grid-cols-3 gap-x-5 gap-y-6 pt-2 sm:grid-cols-4 sm:gap-x-6 sm:gap-y-8 md:grid-cols-5 md:gap-x-7 lg:grid-cols-5 lg:gap-x-5 lg:gap-y-6 xl:grid-cols-6 2xl:grid-cols-7">
              {items.map((item) => {
                const u = normalizeUnit(item.unit)
                const isBarra = locationMode === 'BARRA'
                const counted = isBarra ? numericByIdBarra[item.id] : numericByIdCamara[item.id]
                const numeric = counted ?? 0

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
                    onVisibilityToggle={() => toggleDraftVisibility(item.id)}
                    onClear={() => {
                      const setPhysical = isBarra ? setPhysicalCountsBarra : setPhysicalCountsCamara
                      const setNumeric = isBarra ? setNumericByIdBarra : setNumericByIdCamara
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
                    }}
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
    <div className="flex min-w-0 w-full flex-col gap-2">
      <div className="flex min-w-0 w-full shrink-0 items-center gap-1.5 sm:gap-2">
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

      {!visibilityEditMode && onOpenPending ? (
        <Button
          type="button"
          variant="secondary"
          instance="inventory-pending-counts-open"
          onClick={onOpenPending}
          className="shrink-0"
        >
          {pendingCount > 0 ? `Pendientes (${pendingCount})` : 'Pendientes'}
        </Button>
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
          instance="inventory-new-count"
          onClick={handleNew}
          className="shrink-0"
        >
          Nuevo
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
          className="shrink-0"
        >
          Guardar
        </Button>
      ) : null}
      </div>

      {!visibilityEditMode ? (
        <div className="flex w-full justify-center">
          <PetroleumSegmented
            instance="inventory-location"
            density="compact"
            aria-label="Ubicación del recuento"
            value={locationMode}
            onChange={(next) => setLocationMode(next as 'BARRA' | 'CAMARA')}
            options={[
              { value: 'BARRA', label: 'Barra' },
              { value: 'CAMARA', label: 'Cámara' },
            ]}
          />
        </div>
      ) : null}
    </div>
  )

  if (!visibilityEditMode && initialIngredients.length === 0) {
    return (
      <DashboardDetailLayout
        title="Ingredientes"
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
      subtitle={visibilityEditMode ? 'Activa o desactiva artículos del recuento' : undefined}
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
