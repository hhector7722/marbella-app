'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, useTransition, useEffect } from 'react'
import { toast } from 'sonner'
import { Check, Filter, Trash2, ChevronDown, X, ChefHat } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { TABLE_COMPONENT_ID } from '@/lib/design-system'
import { EmptyState } from '@/components/ui/EmptyState'
import { SearchField } from '@/components/ui/SearchField'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useTrackModalApply } from '@/hooks/useTrackModalApply'
import { namedEntitySummary } from '@/lib/usage/modal-apply'
import type { AlbaranLearnedName, MappingRow, Recipe, RecipeIngredientMatchRow, TpvArticle } from './page'
import {
  addRecipeIngredientLineAction,
  deleteMapping,
  deleteRecipeIngredientLineAction,
  deleteSupplierMappingByIdAction,
  deleteSupplierMappingCompositeAction,
  upsertMapping,
  upsertSupplierMappingForIngredientAction,
} from './actions'

type StatusFilter = 'all' | 'mapped' | 'unmapped'

type UiRow = {
  articulo_id: number
  nombre: string
  departamento: string | null
  mapped: boolean
  recipe_id: string | null
  recipe_name: string | null
  factor_porcion: number
}

type IngredientModalState = {
  articulo_id: number
  articulo_nombre: string
  recipe_id: string
  recipe_name: string
}

/** TPV | Receta | Ingredientes | acciones — columna factor oculta (valor sigue en borrador al guardar). */
const TABLE_GRID_COLS =
  'grid w-full grid-cols-[minmax(0,0.72fr)_minmax(0,0.68fr)_minmax(0,1.12fr)_1.75rem]'

/** Misma clave lógica que en upsert conflict (proveedor + nombre), pero tolera variantes tipográficas (acentos, mayúsculas). */
function normalizeSupplierItemNameForDedupe(s: string): string {
  return s
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function albaranLearnedLogicalKey(a: AlbaranLearnedName): string {
  return `${a.supplier_id ?? ''}::${normalizeSupplierItemNameForDedupe(a.supplier_item_name)}`
}

/** Solo vista tabla: evita dos líneas casi iguales (p. ej. CAFÉ vs CAFÈ). En el modal siguen todas las filas para poder borrar duplicados reales en BD. */
function dedupeAlbaranForTablePreview(rows: AlbaranLearnedName[]): AlbaranLearnedName[] {
  const byKey = new Map<string, AlbaranLearnedName>()
  for (const a of rows) {
    const k = albaranLearnedLogicalKey(a)
    if (!byKey.has(k)) byKey.set(k, a)
  }
  return [...byKey.values()].sort((a, b) =>
    a.supplier_item_name.localeCompare(b.supplier_item_name, 'es')
  )
}

export default function MappingClient({
  mappings,
  articles,
  recipes,
  suppliersMini,
  ingredientsMini,
  recipeIngredientMatchByRecipeId,
}: {
  mappings: MappingRow[]
  articles: TpvArticle[]
  recipes: Recipe[]
  suppliersMini: { id: number; name: string }[]
  ingredientsMini: { id: string; name: string }[]
  recipeIngredientMatchByRecipeId: Record<string, RecipeIngredientMatchRow[]>
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [isPending, startTransition] = useTransition()

  const [drafts, setDrafts] = useState<Record<number, { recipe_id: string | null; factor: string }>>({})
  const [busyId, setBusyId] = useState<number | null>(null)
  const [ingModal, setIngModal] = useState<IngredientModalState | null>(null)
  const trackTpvMappingSave = useTrackModalApply('recetas-tpv-mapping-save', 'Guardar mapeo TPV')
  const [deptFilter, setDeptFilter] = useState<string | null>(null)
  const [deptMenuOpen, setDeptMenuOpen] = useState(false)
  const deptMenuRef = useRef<HTMLDivElement>(null)

  const mappingByArticulo = useMemo(() => {
    const m = new Map<number, { recipe_id: string; factor_porcion: number; recipe_name?: string | null }>()
    for (const row of mappings) {
      m.set(row.articulo_id, {
        recipe_id: row.recipe_id,
        factor_porcion: Number(row.factor_porcion ?? 1),
        recipe_name: row.recipes?.name ?? null,
      })
    }
    return m
  }, [mappings])

  const uiRows = useMemo<UiRow[]>(() => {
    const rows: UiRow[] = []
    for (const a of articles) {
      const mapping = mappingByArticulo.get(a.id)
      rows.push({
        articulo_id: a.id,
        nombre: a.nombre,
        departamento:
          a.bdp_departamentos?.nombre ?? (a.departamento_id != null ? `Dept ${a.departamento_id}` : null),
        mapped: mapping != null,
        recipe_id: mapping?.recipe_id ?? null,
        recipe_name: mapping?.recipe_name ?? null,
        factor_porcion: mapping?.factor_porcion ?? 1,
      })
    }
    return rows
  }, [articles, mappingByArticulo])

  useEffect(() => {
    if (!deptMenuOpen) return
    function handleDown(e: MouseEvent) {
      if (deptMenuRef.current && !deptMenuRef.current.contains(e.target as Node)) {
        setDeptMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleDown)
    return () => document.removeEventListener('mousedown', handleDown)
  }, [deptMenuOpen])

  const departmentOptions = useMemo(() => {
    const labels = new Set<string>()
    for (const r of uiRows) {
      labels.add(r.departamento?.trim() ? r.departamento.trim() : 'Sin departamento')
    }
    return [...labels].sort((a, b) => a.localeCompare(b, 'es'))
  }, [uiRows])

  const effectiveRecipeId = (row: UiRow) => {
    const d = drafts[row.articulo_id]
    if (d?.recipe_id != null) return d.recipe_id
    return row.recipe_id
  }

  const matchSearchBlob = (recipeId: string | null) => {
    if (!recipeId) return ''
    const rows = recipeIngredientMatchByRecipeId[recipeId] ?? []
    return rows
      .map(
        (row) =>
          `${row.ingredient_name} ${row.albaran.map((a) => `${a.supplier_item_name} ${a.supplier_name ?? ''}`).join(' ')}`
      )
      .join(' ')
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return uiRows.filter((r) => {
      if (deptFilter != null) {
        const rowDept = r.departamento?.trim() ? r.departamento.trim() : 'Sin departamento'
        if (rowDept !== deptFilter) return false
      }
      if (status === 'mapped' && !r.mapped) return false
      if (status === 'unmapped' && r.mapped) return false
      if (!q) return true
      const rid = effectiveRecipeId(r)
      const blob = `${r.nombre} ${String(r.articulo_id)} ${r.departamento ?? ''} ${r.recipe_name ?? ''} ${matchSearchBlob(rid)}`.toLowerCase()
      return blob.includes(q)
    })
  }, [uiRows, query, status, drafts, recipeIngredientMatchByRecipeId, deptFilter])

  /** Sin agrupación por departamento en la UI: solo orden estable (dept + nombre). */
  const sortedRows = useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) => {
      const da = (a.departamento ?? '').localeCompare(b.departamento ?? '', 'es')
      if (da !== 0) return da
      return a.nombre.localeCompare(b.nombre, 'es')
    })
    return copy
  }, [filtered])

  const modalMatchRows = ingModal ? (recipeIngredientMatchByRecipeId[ingModal.recipe_id] ?? []) : []

  const getDraft = (row: UiRow) => {
    const existing = drafts[row.articulo_id]
    if (existing) return existing
    return {
      recipe_id: row.recipe_id,
      factor: String(row.factor_porcion ?? 1),
    }
  }

  const setDraft = (articulo_id: number, next: Partial<{ recipe_id: string | null; factor: string }>) => {
    setDrafts((prev) => {
      const current = prev[articulo_id] ?? { recipe_id: null, factor: '1' }
      return { ...prev, [articulo_id]: { ...current, ...next } }
    })
  }

  const onSave = async (row: UiRow) => {
    const draft = getDraft(row)
    const recipeId = draft.recipe_id
    const factor = Number(draft.factor)
    if (!recipeId) {
      toast.error('Selecciona una receta antes de guardar.')
      return
    }
    if (!Number.isFinite(factor) || factor <= 0) {
      toast.error('Factor de porción inválido (debe ser > 0).')
      return
    }

    setBusyId(row.articulo_id)
    startTransition(async () => {
      const res = await upsertMapping(row.articulo_id, recipeId, factor)
      setBusyId(null)
      if (!res.success) {
        toast.error(res.error ?? 'Error guardando el mapeo')
        return
      }
      const recipeName = recipes.find((r) => r.id === recipeId)?.name ?? recipeId
      trackTpvMappingSave(`${namedEntitySummary(row.nombre)} → ${namedEntitySummary(recipeName)}`, {
        articuloId: String(row.articulo_id),
        recipeId,
      })
      toast.success('Mapeo guardado.')
      router.refresh()
    })
  }

  const onDelete = async (row: UiRow) => {
    if (!row.mapped) return

    setBusyId(row.articulo_id)
    startTransition(async () => {
      const res = await deleteMapping(row.articulo_id)
      setBusyId(null)
      if (!res.success) {
        toast.error(res.error ?? 'Error eliminando el mapeo')
        return
      }
      toast.success('Mapeo eliminado.')
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex w-full min-w-0 items-center gap-2">
        <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm hover:bg-emerald-600 hover:shadow transition-all"
            aria-label="Añadir nueva receta"
        >
            <ChefHat size={16} strokeWidth={3} className="hidden" />
            <span className="text-lg font-black leading-none">+</span>
        </button>
        <div className="min-w-0 flex-1">
          <SearchField
            instance="mapping-search"
            placeholder="Buscar…"
            value={query}
            onChange={setQuery}
            ariaLabel="Buscar en mapeos TPV"
          />
        </div>
        <div ref={deptMenuRef} className="relative flex shrink-0 items-center gap-1.5">
          {deptFilter != null ? (
            <span
              className="inline-flex max-w-[min(52vw,13rem)] items-center gap-1 truncate rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold leading-tight text-zinc-800"
              title={deptFilter}
            >
              <span className="min-w-0 truncate">{deptFilter}</span>
              <button
                type="button"
                onClick={() => setDeptFilter(null)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-600 text-white shadow-sm"
                aria-label="Quitar filtro de departamento"
              >
                <X className="h-2.5 w-2.5 stroke-[3]" />
              </button>
            </span>
          ) : null}
          <Button
            type="button"
            variant="tertiary"
            instance="recetas-tpv-filtrar-departamento"
            onClick={() => setDeptMenuOpen((v) => !v)}
            aria-label="Filtrar por departamento"
            icon={<Filter className="h-5 w-5" strokeWidth={2} />}
            className="shrink-0"
          />
          {deptMenuOpen ? (
            <div
              className="absolute right-0 top-full z-[60] mt-1 max-h-56 min-w-[12rem] overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-xl"
              role="listbox"
            >
              {departmentOptions.map((label) => (
                <button
                  key={label}
                  type="button"
                  role="option"
                  aria-selected={deptFilter === label}
                  className={cn(
                    'flex w-full px-3 py-2 text-left text-xs font-semibold hover:bg-zinc-50',
                    deptFilter === label && 'bg-emerald-50 text-emerald-800'
                  )}
                  onClick={() => {
                    setDeptFilter(label)
                    setDeptMenuOpen(false)
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="grid w-full shrink-0 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center rounded-t-lg border-b border-zinc-200 bg-white py-0">
          <div aria-hidden className="shrink-0" />
          <div className="flex min-w-0 justify-center">
            <div className="inline-flex items-stretch">
              <FilterButton active={status === 'all'} onClick={() => setStatus('all')}>
                Todos
              </FilterButton>
              <FilterButton active={status === 'mapped'} onClick={() => setStatus('mapped')}>
                Con receta
              </FilterButton>
              <FilterButton active={status === 'unmapped'} onClick={() => setStatus('unmapped')}>
                Sin receta
              </FilterButton>
            </div>
          </div>
          <div aria-hidden className="shrink-0" />
        </div>

        <div className="w-full min-w-0">
          <div
            data-component={TABLE_COMPONENT_ID}
            data-instance="recetas-tpv-header"
            className={cn(
              TABLE_GRID_COLS,
              'border-b'
            )}
          >
            <div className="px-1 py-2 text-center">TPV</div>
            <div className="px-1 py-2 text-center">Receta</div>
            <div className="px-1 py-2 text-center">Ingredientes</div>
            <div className="px-0 py-2 text-center"> </div>
          </div>

          <div>
            {sortedRows.map((row, idx) => {
              const draft = getDraft(row)
              const isBusy = busyId === row.articulo_id || (isPending && busyId === row.articulo_id)
              const hasChanges =
                draft.recipe_id !== row.recipe_id || Number(draft.factor) !== Number(row.factor_porcion ?? 1)
              const rid = effectiveRecipeId(row)
              const matchRows = rid ? (recipeIngredientMatchByRecipeId[rid] ?? []) : []
              const recipeLabel = recipes.find((x) => x.id === rid)?.name ?? row.recipe_name ?? '—'

              return (
                <div
                  key={row.articulo_id}
                  className={cn(
                    TABLE_GRID_COLS,
                    'items-start border-b border-zinc-100 bg-white',
                    idx === sortedRows.length - 1 && 'border-b-0',
                    isBusy && 'pointer-events-none opacity-50'
                  )}
                >
                  <div className="flex min-w-0 flex-col items-start justify-start px-1 py-1 text-left">
                    <p className="line-clamp-2 w-full text-[9px] font-semibold leading-tight text-zinc-900">{row.nombre}</p>
                    <span
                      className={cn(
                        'mt-0.5 shrink-0 rounded px-0.5 py-0 text-[7px] font-bold leading-none',
                        row.mapped ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      )}
                    >
                      {row.mapped ? '·' : '—'}
                    </span>
                  </div>

                  <div className="flex min-w-0 items-start justify-start px-0.5 py-1">
                    <RecipeCombobox
                      compact
                      micro
                      recipes={recipes}
                      selectedId={draft.recipe_id}
                      onSelect={(id) => setDraft(row.articulo_id, { recipe_id: id })}
                      onClear={() => setDraft(row.articulo_id, { recipe_id: null })}
                    />
                  </div>

                  <div className="flex min-w-0 items-start justify-start px-0.5 py-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (!rid) {
                          toast.error('Selecciona una receta en la columna Receta.')
                          return
                        }
                        setIngModal({
                          articulo_id: row.articulo_id,
                          articulo_nombre: row.nombre,
                          recipe_id: rid,
                          recipe_name: recipeLabel,
                        })
                      }}
                      className={cn(
                        'w-full rounded border border-transparent px-0.5 py-1 text-left transition-colors',
                        rid ? 'hover:border-zinc-200 hover:bg-zinc-50/80 active:bg-zinc-100' : 'opacity-60'
                      )}
                      aria-label="Abrir detalle de ingredientes y albarán"
                    >
                      <IngredientEscandalloBlock rows={matchRows} hasRecipe={Boolean(rid)} />
                    </button>
                  </div>

                  <div className="flex shrink-0 flex-col items-center justify-center gap-0 px-0 py-1">
                    {hasChanges && draft.recipe_id ? (
                      <Button
                        type="button"
                        variant="primary"
                        instance={`recetas-tpv-guardar-${row.articulo_id}`}
                        onClick={() => onSave(row)}
                        disabled={isBusy}
                        loading={isBusy}
                        aria-label="Guardar"
                        icon={<Check className="h-3.5 w-3.5" />}
                      />
                    ) : null}
                    {row.mapped ? (
                      <Button
                        type="button"
                        variant="destructive"
                        instance={`recetas-tpv-eliminar-mapeo-${row.articulo_id}`}
                        onClick={() => onDelete(row)}
                        disabled={isBusy}
                        aria-label="Eliminar"
                        icon={<Trash2 className="h-3.5 w-3.5" />}
                      />
                    ) : null}
                  </div>
                </div>
              )
            })}

            {sortedRows.length === 0 ? (
              <EmptyState instance="mapping-rows-mismatch" variant="mismatch" title="Sin resultados." />
            ) : null}
          </div>
        </div>
      </section>

      <IngredientEscandalloModal
        open={ingModal != null}
        onClose={() => setIngModal(null)}
        articuloNombre={ingModal?.articulo_nombre ?? ''}
        recipeId={ingModal?.recipe_id ?? ''}
        recipeName={ingModal?.recipe_name ?? ''}
        matchRows={modalMatchRows}
        suppliersMini={suppliersMini}
        ingredientsMini={ingredientsMini}
        onDone={() => router.refresh()}
      />
    </div>
  )
}

function IngredientEscandalloBlock({
  rows,
  hasRecipe,
}: {
  rows: RecipeIngredientMatchRow[]
  hasRecipe: boolean
}) {
  if (!hasRecipe) {
    return <span className="block text-left text-[10px] leading-none text-zinc-300">—</span>
  }
  if (rows.length === 0) {
    return <span className="block text-left text-[9px] leading-tight text-zinc-400">Sin líneas</span>
  }
  return (
    <div className="space-y-0.5 text-left">
      {rows.map((line) => (
        <div key={line.ingredient_id} className="text-left">
          <span className="block text-[8px] font-bold leading-snug text-[#36606F]">{line.ingredient_name}</span>
          {line.albaran.length === 0 ? (
            <div className="text-[8px] leading-tight text-zinc-400">→ —</div>
          ) : (
            dedupeAlbaranForTablePreview(line.albaran).map((a) => (
              <div
                key={a.id ? `${line.ingredient_id}-${a.id}` : `${line.ingredient_id}-${albaranLearnedLogicalKey(a)}`}
                className="text-[8px] leading-tight text-zinc-600"
                title={a.supplier_name ? `${a.supplier_item_name} · ${a.supplier_name}` : a.supplier_item_name}
              >
                → {a.supplier_item_name}
                {a.supplier_name ? <span className="text-zinc-500"> ({a.supplier_name})</span> : null}
              </div>
            ))
          )}
        </div>
      ))}
    </div>
  )
}

function IngredientEscandalloModal({
  open,
  onClose,
  articuloNombre,
  recipeId,
  recipeName,
  matchRows,
  suppliersMini,
  ingredientsMini,
  onDone,
}: {
  open: boolean
  onClose: () => void
  articuloNombre: string
  recipeId: string
  recipeName: string
  matchRows: RecipeIngredientMatchRow[]
  suppliersMini: { id: number; name: string }[]
  ingredientsMini: { id: string; name: string }[]
  onDone: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [addByIng, setAddByIng] = useState<Record<string, { supplierId: string; text: string; factor: string }>>({})
  const [linkIngredientId, setLinkIngredientId] = useState('')
  const [linkUnit, setLinkUnit] = useState('kg')
  const [pendingRemoveIngredientId, setPendingRemoveIngredientId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const init: Record<string, { supplierId: string; text: string; factor: string }> = {}
    const firstSid = suppliersMini[0]?.id != null ? String(suppliersMini[0].id) : ''
    for (const r of matchRows) {
      init[r.ingredient_id] = { supplierId: firstSid, text: '', factor: '1' }
    }
    setAddByIng(init)
  }, [open, matchRows, suppliersMini])

  useEffect(() => {
    if (!open) return
    setLinkIngredientId('')
    setLinkUnit('kg')
  }, [open, recipeId, matchRows])

  const excludeIngredientIds = useMemo(() => new Set(matchRows.map((r) => r.ingredient_id)), [matchRows])
  const linkableIngredients = useMemo(
    () => ingredientsMini.filter((i) => i.id && !excludeIngredientIds.has(i.id)),
    [ingredientsMini, excludeIngredientIds]
  )

  const setAdd = (ingredientId: string, patch: Partial<{ supplierId: string; text: string; factor: string }>) => {
    setAddByIng((prev) => {
      const cur = prev[ingredientId] ?? { supplierId: '', text: '', factor: '1' }
      return { ...prev, [ingredientId]: { ...cur, ...patch } }
    })
  }

  const runAsync = async (fn: () => Promise<{ success: boolean; error?: string }>) => {
    startTransition(async () => {
      const res = await fn()
      if (!res.success) {
        toast.error(res.error ?? 'Error')
        return
      }
      toast.success('Guardado en base de datos.')
      onDone()
    })
  }

  const removeAlbaranRow = (a: AlbaranLearnedName) => {
    if (a.id) {
      void runAsync(() => deleteSupplierMappingByIdAction(a.id))
      return
    }
    if (a.supplier_id != null) {
      const supplierId = a.supplier_id
      void runAsync(() =>
        deleteSupplierMappingCompositeAction({
          supplier_id: supplierId,
          supplier_item_name: a.supplier_item_name,
          ingredient_id: a.ingredient_id,
        })
      )
      return
    }
    toast.error('No se puede eliminar: falta id de mapeo o proveedor.')
  }

  const addAlbaranRow = (ingredientId: string) => {
    const st = addByIng[ingredientId] ?? { supplierId: '', text: '', factor: '1' }
    const sid = Number(st.supplierId)
    const txt = st.text.trim()
    if (!Number.isFinite(sid) || sid <= 0) {
      toast.error('Elige proveedor.')
      return
    }
    if (!txt) {
      toast.error('Escribe el texto del albarán.')
      return
    }
    void runAsync(() =>
      upsertSupplierMappingForIngredientAction({
        supplier_id: sid,
        supplier_item_name: txt,
        ingredient_id: ingredientId,
        conversion_factor: 1,
      })
    )
  }

  const removeIngredientFromRecipe = (ingredientId: string) => {
    setPendingRemoveIngredientId(ingredientId)
  }

  const confirmRemoveIngredient = () => {
    const ingredientId = pendingRemoveIngredientId
    setPendingRemoveIngredientId(null)
    if (!ingredientId) return
    void runAsync(() => deleteRecipeIngredientLineAction({ recipe_id: recipeId, ingredient_id: ingredientId }))
  }

  const submitLinkIngredient = () => {
    if (!linkIngredientId) {
      toast.error('Elige un ingrediente.')
      return
    }
    void runAsync(() =>
      addRecipeIngredientLineAction({ recipe_id: recipeId, ingredient_id: linkIngredientId, unit: linkUnit })
    )
  }

  const subtitle =
    articuloNombre && recipeName
      ? `${articuloNombre} · ${recipeName}`
      : articuloNombre || recipeName

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      variant="standard"
      layer="base"
      instance="recetas-tpv-ingredient-modal"
      usageId="recetas-tpv-ingredient-modal"
      usageLabel="Ingredientes y albarán"
      title="Ingredientes y albarán"
      subtitle={subtitle}
      headerTone="petroleum"
      scrollContent
    >
        <div className="px-2 py-2">
          {matchRows.length === 0 ? (
            <div className="space-y-2">
              <p className="text-[11px] leading-snug text-zinc-600">
                Escandallo vacío. Añade ingredientes del catálogo (misma receta que en{' '}
                <span className="font-semibold">/recipes</span>).
              </p>
              <RecipeLinkIngredientBlock
                title="Vincular"
                pending={pending}
                linkableIngredients={linkableIngredients}
                linkIngredientId={linkIngredientId}
                linkUnit={linkUnit}
                onChangeIngredient={setLinkIngredientId}
                onChangeUnit={setLinkUnit}
                onSubmit={submitLinkIngredient}
              />
            </div>
          ) : (
            <>
              <ul className="space-y-2">
                {matchRows.map((line) => {
                  const st = addByIng[line.ingredient_id] ?? { supplierId: '', text: '', factor: '1' }
                  return (
                    <li key={line.ingredient_id} className="rounded-md border border-zinc-100 p-1.5 shadow-sm">
                      <div className="min-w-0">
                        <Link
                          href="/ingredients"
                          className="text-[11px] font-bold leading-tight text-[#36606F] hover:underline"
                          onClick={onClose}
                        >
                          {line.ingredient_name}
                        </Link>
                        <p className="truncate font-mono text-[8px] leading-none text-zinc-400">{line.ingredient_id}</p>
                      </div>

                      <p className="mt-1 text-[8px] font-bold uppercase tracking-wide text-zinc-500">Albarán</p>
                      <ul className="mt-0.5 space-y-0.5">
                        {line.albaran.map((a, i) => (
                          <li
                            key={a.id || `${line.ingredient_id}-a-${i}`}
                            className="flex items-center justify-between gap-1 rounded bg-zinc-50 px-1 py-0.5"
                          >
                            <div className="min-w-0 text-[10px] leading-tight">
                              <span className="font-medium text-zinc-900">{a.supplier_item_name}</span>
                              {a.supplier_name ? (
                                <span className="text-zinc-500"> · {a.supplier_name}</span>
                              ) : null}
                            </div>
                            <Button
                              type="button"
                              variant="destructive"
                              instance={`recetas-tpv-eliminar-albaran-${a.id || `${line.ingredient_id}-${i}`}`}
                              disabled={pending}
                              onClick={() => removeAlbaranRow(a)}
                              aria-label="Eliminar mapeo de albarán"
                              icon={<Trash2 className="h-3 w-3" />}
                              className="shrink-0"
                            />
                          </li>
                        ))}
                      </ul>

                      <div className="mt-1 rounded border border-dashed border-zinc-200 bg-zinc-50/60 p-1">
                        <p className="text-[8px] font-bold uppercase text-zinc-600">Añadir texto albarán</p>
                        <div className="mt-0.5 flex min-h-8 flex-wrap items-stretch gap-1">
                          <select
                            className="h-8 min-h-8 w-[38%] min-w-0 shrink-0 rounded border border-zinc-200 bg-white px-1 text-[10px] text-zinc-900"
                            value={st.supplierId}
                            onChange={(e) => setAdd(line.ingredient_id, { supplierId: e.target.value })}
                            aria-label="Proveedor"
                          >
                            <option value="">Prov…</option>
                            {suppliersMini.map((s) => (
                              <option key={s.id} value={String(s.id)}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                          <input
                            className="h-8 min-h-8 min-w-0 flex-1 rounded border border-zinc-200 bg-white px-1.5 text-[10px] text-zinc-900"
                            placeholder="Texto albarán"
                            value={st.text}
                            onChange={(e) => setAdd(line.ingredient_id, { text: e.target.value })}
                          />
                        </div>
                        <div className="mt-1 flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="destructive"
                            instance={`recetas-tpv-eliminar-ingrediente-${line.ingredient_id}`}
                            disabled={pending}
                            onClick={() => removeIngredientFromRecipe(line.ingredient_id)}
                            className="shrink-0"
                          >
                            Eliminar
                          </Button>
                          <Button
                            type="button"
                            variant="primary"
                            instance={`recetas-tpv-guardar-albaran-${line.ingredient_id}`}
                            disabled={pending}
                            onClick={() => addAlbaranRow(line.ingredient_id)}
                            className="shrink-0"
                          >
                            Guardar
                          </Button>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <div className="mt-2 border-t border-zinc-100 pt-2">
                <RecipeLinkIngredientBlock
                  title="Otro ingrediente"
                  pending={pending}
                  linkableIngredients={linkableIngredients}
                  linkIngredientId={linkIngredientId}
                  linkUnit={linkUnit}
                  onChangeIngredient={setLinkIngredientId}
                  onChangeUnit={setLinkUnit}
                  onSubmit={submitLinkIngredient}
                />
              </div>
            </>
          )}
        </div>
    </Modal>
    <ConfirmModal
      open={pendingRemoveIngredientId != null}
      onClose={() => { if (!pending) setPendingRemoveIngredientId(null) }}
      title="Quitar ingrediente"
      confirmLabel="Quitar"
      instance="recetas-tpv-remove-ingredient-confirm"
      usageLabel="Confirmar quitar ingrediente de receta"
      confirming={pending}
      onConfirm={confirmRemoveIngredient}
    >
      ¿Quitar este ingrediente de la receta en la base de datos?
    </ConfirmModal>
    </>
  )
}

function RecipeLinkIngredientBlock({
  title,
  pending,
  linkableIngredients,
  linkIngredientId,
  linkUnit,
  onChangeIngredient,
  onChangeUnit,
  onSubmit,
}: {
  title: string
  pending: boolean
  linkableIngredients: { id: string; name: string }[]
  linkIngredientId: string
  linkUnit: string
  onChangeIngredient: (v: string) => void
  onChangeUnit: (v: string) => void
  onSubmit: () => void
}) {
  return (
    <div className="rounded-md border border-dashed border-zinc-200 bg-zinc-50/60 p-1.5">
      <p className="text-[8px] font-bold uppercase text-zinc-600">{title}</p>
      <div className="mt-1 flex flex-wrap items-stretch gap-1">
        <select
          className="h-8 min-h-8 min-w-0 flex-1 rounded border border-zinc-200 bg-white px-1 text-[10px] sm:max-w-[65%]"
          value={linkIngredientId}
          onChange={(e) => onChangeIngredient(e.target.value)}
          aria-label="Ingrediente"
        >
          <option value="">Ingrediente…</option>
          {linkableIngredients.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <select
          className="h-8 min-h-8 w-[4.5rem] shrink-0 rounded border border-zinc-200 bg-white px-1 text-[10px]"
          value={linkUnit}
          onChange={(e) => onChangeUnit(e.target.value)}
          aria-label="Unidad"
        >
          <option value="kg">kg</option>
          <option value="g">g</option>
          <option value="l">l</option>
          <option value="ml">ml</option>
          <option value="ud">ud</option>
        </select>
        <Button
          type="button"
          variant="primary"
          instance="recetas-tpv-añadir-ingrediente"
          disabled={pending}
          onClick={onSubmit}
          className="shrink-0"
        >
          Añadir
        </Button>
      </div>
      {linkableIngredients.length === 0 ? (
        <p className="mt-1 text-[9px] text-amber-800">Sin ingredientes libres en la lista.</p>
      ) : null}
    </div>
  )
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-11 min-h-11 shrink-0 border-0 bg-transparent p-0 px-1 text-[10px] font-semibold transition-colors sm:px-1.5',
        active ? 'font-black text-[#36606F] underline decoration-2 underline-offset-[6px]' : 'text-zinc-500 hover:text-zinc-800'
      )}
    >
      {children}
    </button>
  )
}

function RecipeCombobox({
  recipes,
  selectedId,
  onSelect,
  onClear,
  compact = false,
  micro = false,
}: {
  recipes: Recipe[]
  selectedId: string | null
  onSelect: (id: string) => void
  onClear: () => void
  compact?: boolean
  micro?: boolean
}) {
  const trackTpvRecipePick = useTrackModalApply('recetas-tpv-recipe-pick', 'Seleccionar receta TPV')
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedRecipe = useMemo(() => recipes.find((r) => r.id === selectedId), [recipes, selectedId])
  const filteredRecipes = useMemo(() => {
    if (!search.trim()) return recipes.slice(0, 60)
    const q = search.toLowerCase()
    return recipes.filter((r) => r.name.toLowerCase().includes(q)).slice(0, 60)
  }, [recipes, search])

  const h = micro ? 'min-h-0 h-auto py-1' : compact ? 'h-9 min-h-9' : 'h-12 min-h-12'
  const btnPad = micro ? 'px-1 text-[10px]' : compact ? 'px-2 text-xs' : 'px-4 text-sm'
  const chev = micro ? 'h-3 w-3' : 'h-4 w-4'

  return (
    <div className="relative min-w-0 w-full" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          'min-w-0 w-full',
          micro
            ? 'flex items-start justify-start border-0 bg-transparent py-1 text-left shadow-none outline-none ring-0'
            : 'flex min-w-0 w-full items-center justify-between gap-0.5 truncate rounded border border-zinc-200 bg-white text-left shadow-sm transition-colors hover:bg-zinc-50',
          !micro && h,
          micro ? 'px-1 text-[10px]' : btnPad
        )}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span
          className={cn(
            'min-w-0 font-semibold',
            micro
              ? 'whitespace-normal break-words text-left leading-snug [overflow-wrap:anywhere]'
              : 'truncate',
            selectedRecipe ? 'text-zinc-900' : 'text-zinc-400'
          )}
        >
          {selectedRecipe ? selectedRecipe.name : micro ? '\u00A0' : '…'}
        </span>
        {!micro ? (
          <ChevronDown className={cn('shrink-0 text-zinc-400 transition-transform', chev, isOpen && 'rotate-180')} />
        ) : null}
      </button>

      {!micro ? (
        <div className="mt-px flex justify-end">
          <button
            type="button"
            onClick={() => {
              onClear()
              setIsOpen(false)
              setSearch('')
            }}
            className={cn(
              'flex items-center justify-center rounded border px-2 py-1 text-[10px] font-semibold transition-colors',
              selectedId
                ? 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100'
                : 'cursor-not-allowed border-zinc-100 text-zinc-300'
            )}
            disabled={!selectedId}
          >
            Quitar receta
          </button>
        </div>
      ) : null}

      {isOpen ? (
        <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl">
          <div className="border-b border-zinc-100 bg-zinc-50 p-1.5">
            <SearchField
              instance="mapping-recipe-search"
              placeholder="Buscar…"
              value={search}
              onChange={setSearch}
              autoFocus
            />
          </div>
          <div className="max-h-[220px] overflow-y-auto">
            <ul className="py-0.5" role="listbox">
              <li role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={selectedId == null}
                  onClick={() => {
                    onClear()
                    setIsOpen(false)
                    setSearch('')
                  }}
                  className={cn(
                    'w-full px-2 py-2 text-left text-xs font-semibold transition-colors hover:bg-zinc-100',
                    selectedId == null ? 'bg-zinc-50 text-zinc-400' : 'text-zinc-500'
                  )}
                >
                  {'\u00A0'}
                </button>
              </li>
              {filteredRecipes.length === 0 ? (
                <li>
                  <EmptyState instance="mapping-recipe-mismatch" variant="mismatch" title="Sin resultados." />
                </li>
              ) : (
                filteredRecipes.map((r) => (
                  <li key={r.id} role="none">
                    <button
                      type="button"
                      role="option"
                      aria-selected={r.id === selectedId}
                      onClick={() => {
                        trackTpvRecipePick(namedEntitySummary(r.name), { recipeId: r.id })
                        onSelect(r.id)
                        setIsOpen(false)
                        setSearch('')
                      }}
                      className={cn(
                        'w-full px-2 py-2 text-left text-xs font-semibold transition-colors hover:bg-zinc-100',
                        r.id === selectedId ? 'bg-emerald-50 text-emerald-700' : 'text-zinc-800'
                      )}
                    >
                      {r.name}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  )
}
