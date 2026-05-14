'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useRef, useState, useTransition, useEffect } from 'react'
import { toast } from 'sonner'
import { Check, Filter, Loader2, Plus, Search, Trash2, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
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
        <div className="relative min-h-9 min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            className="h-9 w-full min-w-0 rounded-md border border-zinc-200 bg-white pl-8 pr-2 text-xs text-zinc-900 shadow-sm focus:outline-none focus:ring-1 focus:ring-[#5B8FB9]"
            placeholder="Buscar…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar en mapeos TPV"
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
          <button
            type="button"
            onClick={() => setDeptMenuOpen((v) => !v)}
            className="flex h-9 min-h-9 w-9 shrink-0 items-center justify-center border-0 bg-transparent p-0 text-zinc-600 outline-none ring-0 hover:text-zinc-900"
            aria-expanded={deptMenuOpen}
            aria-haspopup="listbox"
            aria-label="Filtrar por departamento"
            title="Departamento"
          >
            <Filter className="h-5 w-5" strokeWidth={2} />
          </button>
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
            className={cn(
              TABLE_GRID_COLS,
              'border-b border-[#2A4B57] bg-[#36606F] text-[10px] font-semibold normal-case leading-tight tracking-normal text-white sm:text-[11px]'
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
                  <div className="flex min-w-0 flex-col items-center justify-center px-1 py-1 text-center">
                    <p className="line-clamp-2 text-[9px] font-semibold leading-tight text-zinc-900">{row.nombre}</p>
                    <div className="mt-0.5 flex flex-wrap items-center justify-center gap-0.5">
                      <span className="font-mono text-[8px] leading-none text-zinc-500">{row.articulo_id}</span>
                      <span
                        className={cn(
                          'rounded px-0.5 py-0 text-[7px] font-bold leading-none',
                          row.mapped ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        )}
                      >
                        {row.mapped ? '·' : '—'}
                      </span>
                    </div>
                  </div>

                  <div className="flex min-w-0 items-start justify-center px-0.5 py-1">
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
                    <button
                      type="button"
                      onClick={() => onSave(row)}
                      disabled={!hasChanges || !draft.recipe_id}
                      className={cn(
                        'flex min-h-9 w-full shrink-0 items-center justify-center border-0 bg-transparent p-0 py-0.5 shadow-none outline-none ring-0',
                        'text-[10px] font-bold transition-colors',
                        !hasChanges || !draft.recipe_id
                          ? 'cursor-not-allowed text-zinc-300'
                          : 'text-emerald-600 hover:text-emerald-800'
                      )}
                      title="Guardar"
                    >
                      {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(row)}
                      disabled={!row.mapped}
                      className={cn(
                        'flex min-h-9 w-full shrink-0 items-center justify-center border-0 bg-transparent p-0 py-0.5 shadow-none outline-none ring-0',
                        'transition-colors',
                        row.mapped ? 'text-rose-600 hover:text-rose-800' : 'cursor-not-allowed text-zinc-300'
                      )}
                      title="Eliminar mapeo"
                      aria-label="Eliminar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}

            {sortedRows.length === 0 ? (
              <div className="px-2 py-8 text-center text-[10px] text-zinc-500">Sin resultados.</div>
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
            line.albaran.map((a, i) => (
              <div
                key={`${line.ingredient_id}-alb-${i}`}
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
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

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
    const fc = Number(st.factor)
    if (!Number.isFinite(sid) || sid <= 0) {
      toast.error('Elige proveedor.')
      return
    }
    if (!txt) {
      toast.error('Escribe el texto del albarán.')
      return
    }
    if (!Number.isFinite(fc) || fc <= 0) {
      toast.error('Factor inválido.')
      return
    }
    void runAsync(() =>
      upsertSupplierMappingForIngredientAction({
        supplier_id: sid,
        supplier_item_name: txt,
        ingredient_id: ingredientId,
        conversion_factor: fc,
      })
    )
  }

  const removeIngredientFromRecipe = (ingredientId: string) => {
    if (!window.confirm('¿Quitar este ingrediente de la receta en la base de datos?')) return
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

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-3 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ing-modal-title"
        className="max-h-[88vh] w-full max-w-lg overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-zinc-100 bg-[#36606F] px-4 py-3 text-white">
          <div className="min-w-0">
            <h2 id="ing-modal-title" className="text-sm font-bold leading-tight">
              Ingredientes y albarán
            </h2>
            <p className="mt-1 text-[11px] leading-snug text-white/85">
              <span className="font-semibold">{articuloNombre}</span>
              <span className="text-white/60"> · </span>
              <span>{recipeName}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 min-h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white hover:bg-white/10"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(88vh-5rem)] overflow-y-auto px-3 py-3">
          {matchRows.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-zinc-600">
                Esta receta aún no tiene líneas en el escandallo. Vincula ingredientes existentes del catálogo; se
                guardan en la misma receta que en <span className="font-semibold">/recipes</span>.
              </p>
              <RecipeLinkIngredientBlock
                title="Vincular ingrediente"
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
              <ul className="space-y-4">
                {matchRows.map((line) => {
                  const st = addByIng[line.ingredient_id] ?? { supplierId: '', text: '', factor: '1' }
                  return (
                    <li key={line.ingredient_id} className="rounded-lg border border-zinc-100 p-3 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href="/ingredients"
                          className="text-sm font-bold text-[#36606F] hover:underline"
                          onClick={onClose}
                        >
                          {line.ingredient_name}
                        </Link>
                        <p className="mt-0.5 font-mono text-[10px] text-zinc-500">{line.ingredient_id}</p>
                      </div>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => removeIngredientFromRecipe(line.ingredient_id)}
                        className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                      >
                        Quitar de la receta
                      </button>
                    </div>

                    <p className="mb-1 mt-3 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                      Textos en albarán (mapeo)
                    </p>
                    <ul className="space-y-1.5">
                      {line.albaran.map((a, i) => (
                        <li
                          key={a.id || `${line.ingredient_id}-a-${i}`}
                          className="flex items-start justify-between gap-2 rounded-md bg-zinc-50 px-2 py-1.5 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-zinc-900">{a.supplier_item_name}</p>
                            {a.supplier_name ? <p className="text-xs text-zinc-500">{a.supplier_name}</p> : null}
                          </div>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => removeAlbaranRow(a)}
                            className="shrink-0 rounded-md p-2 text-rose-600 hover:bg-rose-100 disabled:opacity-50"
                            aria-label="Eliminar mapeo de albarán"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-3 space-y-2 rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 p-2">
                      <p className="text-[10px] font-bold uppercase text-zinc-600">Añadir texto de albarán</p>
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <select
                          className="h-11 min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm sm:min-w-[10rem]"
                          value={st.supplierId}
                          onChange={(e) => setAdd(line.ingredient_id, { supplierId: e.target.value })}
                          aria-label="Proveedor"
                        >
                          <option value="">Proveedor…</option>
                          {suppliersMini.map((s) => (
                            <option key={s.id} value={String(s.id)}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                        <input
                          className="h-11 min-h-11 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 text-sm"
                          placeholder="Texto como en albarán"
                          value={st.text}
                          onChange={(e) => setAdd(line.ingredient_id, { text: e.target.value })}
                        />
                        <input
                          className="h-11 min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-2 text-center text-sm sm:w-20"
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={st.factor}
                          onChange={(e) => setAdd(line.ingredient_id, { factor: e.target.value })}
                          aria-label="Factor conversión"
                        />
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => addAlbaranRow(line.ingredient_id)}
                          className="flex h-11 min-h-11 shrink-0 items-center justify-center gap-1 rounded-lg bg-[#36606F] px-3 text-sm font-bold text-white hover:bg-[#2A4B57] disabled:opacity-50"
                        >
                          <Plus className="h-4 w-4" />
                          Guardar
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
              <div className="mt-4 border-t border-zinc-100 pt-4">
                <RecipeLinkIngredientBlock
                  title="Añadir otro ingrediente a la receta"
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
      </div>
    </div>
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
    <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/60 p-3">
      <p className="text-[10px] font-bold uppercase text-zinc-600">{title}</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <select
          className="h-11 min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm sm:min-w-[12rem]"
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
          className="h-11 min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm sm:w-28"
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
        <button
          type="button"
          disabled={pending}
          onClick={onSubmit}
          className="flex h-11 min-h-11 shrink-0 items-center justify-center gap-1 rounded-lg bg-[#36606F] px-4 text-sm font-bold text-white hover:bg-[#2A4B57] disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Añadir a la receta
        </button>
      </div>
      {linkableIngredients.length === 0 ? (
        <p className="mt-2 text-xs text-amber-800">No quedan ingredientes en la lista cargada.</p>
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
            ? 'flex items-start justify-center border-0 bg-transparent py-1 text-center shadow-none outline-none ring-0'
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
              ? 'whitespace-normal break-words text-center leading-snug [overflow-wrap:anywhere]'
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
            <input
              className="h-8 w-full rounded border border-zinc-200 bg-white px-2 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#5B8FB9]"
              placeholder="Buscar…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
                <li className="px-3 py-2 text-center text-xs text-zinc-500">Sin resultados.</li>
              ) : (
                filteredRecipes.map((r) => (
                  <li key={r.id} role="none">
                    <button
                      type="button"
                      role="option"
                      aria-selected={r.id === selectedId}
                      onClick={() => {
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
