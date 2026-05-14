'use client'

import Link from 'next/link'
import { useMemo, useRef, useState, useTransition, useEffect } from 'react'
import { toast } from 'sonner'
import { Check, Loader2, Search, Trash2, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MappingRow, Recipe, RecipeIngredientMatchRow, TpvArticle } from './page'
import { deleteMapping, upsertMapping } from './actions'

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

/** TPV | Receta | F | ingredientes BD ↔ albarán | acciones */
const TABLE_GRID =
  'grid w-full grid-cols-[minmax(0,0.82fr)_minmax(0,0.68fr)_1.35rem_minmax(0,1.1fr)_1.75rem] divide-x divide-zinc-200'

export default function MappingClient({
  mappings,
  articles,
  recipes,
  recipeIngredientMatchByRecipeId,
}: {
  mappings: MappingRow[]
  articles: TpvArticle[]
  recipes: Recipe[]
  recipeIngredientMatchByRecipeId: Record<string, RecipeIngredientMatchRow[]>
}) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [isPending, startTransition] = useTransition()

  const [drafts, setDrafts] = useState<Record<number, { recipe_id: string | null; factor: string }>>({})
  const [busyId, setBusyId] = useState<number | null>(null)

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
      if (status === 'mapped' && !r.mapped) return false
      if (status === 'unmapped' && r.mapped) return false
      if (!q) return true
      const rid = effectiveRecipeId(r)
      const blob = `${r.nombre} ${String(r.articulo_id)} ${r.departamento ?? ''} ${r.recipe_name ?? ''} ${matchSearchBlob(rid)}`.toLowerCase()
      return blob.includes(q)
    })
  }, [uiRows, query, status, drafts, recipeIngredientMatchByRecipeId])

  const grouped = useMemo(() => {
    const groups = new Map<string, UiRow[]>()
    const fallback = 'Sin departamento'
    for (const r of filtered) {
      const key = r.departamento ?? fallback
      const list = groups.get(key) ?? []
      list.push(r)
      groups.set(key, list)
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([department, rows]) => ({ department, rows }))
  }, [filtered])

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
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            className="h-9 w-full rounded-md border border-zinc-200 bg-white pl-8 pr-2 text-xs text-zinc-900 shadow-sm focus:outline-none focus:ring-1 focus:ring-[#5B8FB9]"
            placeholder="Buscar…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar en mapeos TPV"
          />
        </div>

        <div className="flex shrink-0 rounded-md bg-zinc-100 p-0.5">
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

      <div className="space-y-2">
        {grouped.map(({ department, rows }) => (
          <section key={department} className="rounded-lg border border-zinc-200 bg-white shadow-sm">
            <header className="flex items-center justify-between border-b border-zinc-200 bg-zinc-100 px-2 py-1">
              <span className="truncate text-[10px] font-bold uppercase tracking-wide text-zinc-700">{department}</span>
              <span className="shrink-0 rounded bg-zinc-200/80 px-1.5 py-0 text-[10px] font-semibold tabular-nums text-zinc-800">
                {rows.length}
              </span>
            </header>

            <div className="w-full min-w-0">
                <div
                  className={cn(
                    TABLE_GRID,
                    'border-b border-zinc-300 bg-zinc-100 text-[9px] font-bold uppercase leading-none tracking-wide text-zinc-600'
                  )}
                >
                  <div className="px-1 py-1.5">TPV</div>
                  <div className="px-1 py-1.5">Rec.</div>
                  <div className="px-0 py-1.5 text-center">F</div>
                  <div className="px-1 py-1.5">Ing.</div>
                  <div className="px-0 py-1.5 text-center"> </div>
                </div>

                <div className="divide-y divide-zinc-200">
                  {rows.map((row, idx) => {
                    const draft = getDraft(row)
                    const isBusy = busyId === row.articulo_id || (isPending && busyId === row.articulo_id)
                    const hasChanges =
                      draft.recipe_id !== row.recipe_id || Number(draft.factor) !== Number(row.factor_porcion ?? 1)
                    const rid = effectiveRecipeId(row)
                    const matchRows = rid ? (recipeIngredientMatchByRecipeId[rid] ?? []) : []

                    return (
                      <div
                        key={row.articulo_id}
                        className={cn(
                          TABLE_GRID,
                          'items-stretch',
                          idx % 2 === 1 ? 'bg-zinc-50/70' : 'bg-white',
                          isBusy && 'pointer-events-none opacity-50'
                        )}
                      >
                        <div className="min-w-0 px-1 py-1">
                          <p className="line-clamp-2 text-[10px] font-semibold leading-tight text-zinc-900">{row.nombre}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-0.5">
                            <span className="font-mono text-[9px] leading-none text-zinc-500">{row.articulo_id}</span>
                            {row.departamento ? (
                              <span className="max-w-[4.5rem] truncate rounded bg-zinc-100 px-0.5 py-0 text-[8px] leading-tight text-zinc-600">
                                {row.departamento}
                              </span>
                            ) : null}
                            <span
                              className={cn(
                                'rounded px-0.5 py-0 text-[8px] font-bold leading-none',
                                row.mapped ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                              )}
                            >
                              {row.mapped ? '·' : '—'}
                            </span>
                          </div>
                        </div>

                        <div className="min-w-0 px-0.5 py-0.5">
                          <RecipeCombobox
                            compact
                            micro
                            recipes={recipes}
                            selectedId={draft.recipe_id}
                            onSelect={(id) => setDraft(row.articulo_id, { recipe_id: id })}
                            onClear={() => setDraft(row.articulo_id, { recipe_id: null })}
                          />
                        </div>

                        <div className="flex items-center justify-center px-0 py-0.5">
                          <input
                            className="h-8 w-full min-w-0 rounded border border-zinc-200 bg-white px-0.5 text-center text-[10px] font-semibold tabular-nums text-zinc-900 shadow-sm focus:outline-none focus:ring-1 focus:ring-[#5B8FB9]"
                            type="number"
                            step="0.01"
                            min="0.01"
                            inputMode="decimal"
                            value={draft.factor}
                            onChange={(e) => setDraft(row.articulo_id, { factor: e.target.value })}
                            aria-label={`Factor ${row.nombre}`}
                          />
                        </div>

                        <div className="min-w-0 px-0.5 py-0.5">
                          <IngredientEscandalloBlock rows={matchRows} hasRecipe={Boolean(rid)} />
                        </div>

                        <div className="flex shrink-0 flex-col items-stretch justify-center gap-0.5 px-0 py-0.5">
                          <button
                            type="button"
                            onClick={() => onSave(row)}
                            disabled={!hasChanges || !draft.recipe_id}
                            className={cn(
                              'flex h-8 min-h-8 w-full shrink-0 items-center justify-center rounded border text-[10px] font-bold transition-colors',
                              !hasChanges || !draft.recipe_id
                                ? 'cursor-not-allowed bg-zinc-100 text-zinc-400'
                                : 'border-[#2A4B57] bg-[#36606F] text-white hover:bg-[#2A4B57]'
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
                              'flex h-8 min-h-8 w-full shrink-0 items-center justify-center rounded border text-rose-600 transition-colors',
                              row.mapped
                                ? 'border-rose-200 bg-rose-50 hover:bg-rose-100'
                                : 'cursor-not-allowed border-zinc-100 bg-zinc-50 text-zinc-300'
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
                </div>

                {rows.length === 0 ? (
                  <div className="px-2 py-6 text-center text-[10px] text-zinc-500">Sin resultados.</div>
                ) : null}
            </div>
          </section>
        ))}

        {grouped.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-6 text-center text-xs text-zinc-500 shadow-sm">
            No hay artículos que coincidan.
          </div>
        ) : null}
      </div>
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
    return <span className="block text-center text-[10px] leading-none text-zinc-300">—</span>
  }
  if (rows.length === 0) {
    return <span className="block text-center text-[9px] leading-tight text-zinc-400">Sin líneas</span>
  }
  return (
    <div className="max-h-[5rem] space-y-1 overflow-y-auto text-left">
      {rows.map((line) => (
        <div key={line.ingredient_id} className="border-l border-emerald-300/80 pl-1">
          <Link
            href="/ingredients"
            className="line-clamp-2 text-[8px] font-bold leading-tight text-[#36606F] hover:underline"
            title={`Ingrediente en catálogo: ${line.ingredient_name}`}
          >
            {line.ingredient_name}
          </Link>
          {line.albaran.length === 0 ? (
            <div className="pl-0.5 text-[8px] leading-tight text-zinc-400">→ —</div>
          ) : (
            line.albaran.map((a, i) => (
              <div
                key={`${line.ingredient_id}-alb-${i}`}
                className="truncate pl-0.5 text-[8px] leading-tight text-zinc-600"
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
        'h-8 min-h-8 shrink-0 rounded px-2 text-[10px] font-semibold transition-colors',
        active ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-800'
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

  const h = micro ? 'h-8 min-h-8' : compact ? 'h-9 min-h-9' : 'h-12 min-h-12'
  const btnPad = micro ? 'px-1 text-[10px]' : compact ? 'px-2 text-xs' : 'px-4 text-sm'
  const clearW = micro ? 'w-6 min-w-6' : compact ? 'w-9 min-w-9' : 'w-12 min-w-12'
  const chev = micro ? 'h-3 w-3' : 'h-4 w-4'
  const iconClear = micro ? 'h-3 w-3' : 'h-4 w-4'

  return (
    <div className="relative min-w-0 w-full" ref={wrapperRef}>
      <div className="flex min-w-0 gap-px">
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className={cn(
            'min-w-0 flex-1 truncate',
            'flex items-center justify-between gap-0.5 rounded border border-zinc-200 bg-white text-left shadow-sm transition-colors hover:bg-zinc-50',
            h,
            btnPad
          )}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <span className={cn('min-w-0 truncate font-semibold', selectedRecipe ? 'text-zinc-900' : 'text-zinc-400')}>
            {selectedRecipe ? selectedRecipe.name : '…'}
          </span>
          <ChevronDown className={cn('shrink-0 text-zinc-400 transition-transform', chev, isOpen && 'rotate-180')} />
        </button>

        <button
          type="button"
          onClick={() => {
            onClear()
            setIsOpen(false)
            setSearch('')
          }}
          className={cn(
            'flex shrink-0 items-center justify-center rounded border transition-colors',
            h,
            clearW,
            selectedId
              ? 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100'
              : 'cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-300'
          )}
          disabled={!selectedId}
          title="Quitar"
          aria-label="Quitar receta"
        >
          <X className={iconClear} />
        </button>
      </div>

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
            {filteredRecipes.length === 0 ? (
              <div className="p-3 text-center text-xs text-zinc-500">Sin resultados.</div>
            ) : (
              <ul className="py-0.5" role="listbox">
                {filteredRecipes.map((r) => (
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
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
