'use client'

import { useMemo, useRef, useState, useTransition, useEffect } from 'react'
import { toast } from 'sonner'
import { Check, Loader2, Search, Trash2, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AlbaranLearnedName, MappingRow, Recipe, TpvArticle } from './page'
import { deleteMapping, upsertMapping } from './actions'

type StatusFilter = 'all' | 'mapped' | 'unmapped'

type UiRow = {
  articulo_id: number
  nombre: string
  familia: string | null
  departamento: string | null
  mapped: boolean
  recipe_id: string | null
  recipe_name: string | null
  factor_porcion: number
}

/** Misma rejilla en todas las anchuras; en pantallas estrechas se desplaza horizontalmente. */
const TABLE_GRID =
  'grid grid-cols-[minmax(11rem,1.15fr)_minmax(12rem,1.35fr)_minmax(3.25rem,0.45fr)_minmax(9.5rem,1fr)_minmax(5.5rem,0.55fr)] divide-x divide-zinc-200'

export default function MappingClient({
  mappings,
  articles,
  recipes,
  albaranLearnedByRecipeId,
}: {
  mappings: MappingRow[]
  articles: TpvArticle[]
  recipes: Recipe[]
  albaranLearnedByRecipeId: Record<string, AlbaranLearnedName[]>
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
        familia: a.bdp_familias?.nombre ?? (a.familia_id != null ? `Familia ${a.familia_id}` : null),
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

  const albaranSearchBlob = (recipeId: string | null) => {
    if (!recipeId) return ''
    const list = albaranLearnedByRecipeId[recipeId] ?? []
    return list.map((x) => `${x.supplier_item_name} ${x.supplier_name ?? ''}`).join(' ')
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return uiRows.filter((r) => {
      if (status === 'mapped' && !r.mapped) return false
      if (status === 'unmapped' && r.mapped) return false
      if (!q) return true
      const rid = effectiveRecipeId(r)
      const blob = `${r.nombre} ${String(r.articulo_id)} ${r.recipe_name ?? ''} ${albaranSearchBlob(rid)}`.toLowerCase()
      return blob.includes(q)
    })
  }, [uiRows, query, status, drafts, albaranLearnedByRecipeId])

  const grouped = useMemo(() => {
    const groups = new Map<string, UiRow[]>()
    const fallback = 'Sin familia'
    for (const r of filtered) {
      const key = r.familia ?? fallback
      const list = groups.get(key) ?? []
      list.push(r)
      groups.set(key, list)
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([family, rows]) => ({ family, rows }))
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
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-10 pr-3 text-sm text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5B8FB9]"
            placeholder="Buscar artículo, ID, receta o texto albarán…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar en mapeos TPV"
          />
        </div>

        <div className="flex shrink-0 rounded-lg bg-zinc-100 p-1">
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

      <div className="space-y-3">
        {grouped.map(({ family, rows }) => (
          <section key={family} className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
            <header className="flex items-center justify-between border-b border-zinc-200 bg-zinc-100 px-3 py-2">
              <span className="truncate text-xs font-bold uppercase tracking-wide text-zinc-700">{family}</span>
              <span className="shrink-0 rounded-md bg-zinc-200/80 px-2 py-0.5 text-xs font-semibold tabular-nums text-zinc-800">
                {rows.length}
              </span>
            </header>

            <div className="overflow-x-auto">
              <div className="min-w-[36rem]">
                <div
                  className={cn(
                    TABLE_GRID,
                    'border-b-2 border-zinc-300 bg-zinc-100 text-[10px] font-bold uppercase tracking-wide text-zinc-600'
                  )}
                >
                  <div className="px-2 py-2">TPV</div>
                  <div className="px-2 py-2">Receta</div>
                  <div className="px-1 py-2 text-center">F.</div>
                  <div className="px-2 py-2">Albarán</div>
                  <div className="px-1 py-2 text-center">Act.</div>
                </div>

                <div className="divide-y divide-zinc-200">
                  {rows.map((row, idx) => {
                    const draft = getDraft(row)
                    const isBusy = busyId === row.articulo_id || (isPending && busyId === row.articulo_id)
                    const hasChanges =
                      draft.recipe_id !== row.recipe_id || Number(draft.factor) !== Number(row.factor_porcion ?? 1)
                    const rid = effectiveRecipeId(row)
                    const albaranList = rid ? (albaranLearnedByRecipeId[rid] ?? []) : []

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
                        <div className="min-w-0 px-2 py-2">
                          <p className="line-clamp-2 text-xs font-semibold leading-snug text-zinc-900">{row.nombre}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <span className="font-mono text-[10px] text-zinc-500">{row.articulo_id}</span>
                            {row.departamento ? (
                              <span className="max-w-[6rem] truncate rounded bg-zinc-100 px-1 py-0 text-[10px] text-zinc-600">
                                {row.departamento}
                              </span>
                            ) : null}
                            <span
                              className={cn(
                                'rounded px-1 py-0 text-[10px] font-bold',
                                row.mapped ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                              )}
                            >
                              {row.mapped ? 'OK' : '—'}
                            </span>
                          </div>
                        </div>

                        <div className="min-w-0 px-2 py-1.5">
                          <RecipeCombobox
                            compact
                            recipes={recipes}
                            selectedId={draft.recipe_id}
                            onSelect={(id) => setDraft(row.articulo_id, { recipe_id: id })}
                            onClear={() => setDraft(row.articulo_id, { recipe_id: null })}
                          />
                        </div>

                        <div className="flex items-center justify-center px-1 py-1.5">
                          <input
                            className="h-9 w-full max-w-[3.25rem] rounded-md border border-zinc-200 bg-white px-1 text-center text-xs font-semibold text-zinc-900 tabular-nums shadow-sm focus:outline-none focus:ring-1 focus:ring-[#5B8FB9]"
                            type="number"
                            step="0.01"
                            min="0.01"
                            inputMode="decimal"
                            value={draft.factor}
                            onChange={(e) => setDraft(row.articulo_id, { factor: e.target.value })}
                            aria-label={`Factor ${row.nombre}`}
                          />
                        </div>

                        <div className="min-w-0 px-2 py-1.5">
                          <AlbaranNamesCompact list={albaranList} hasRecipe={Boolean(rid)} />
                        </div>

                        <div className="flex shrink-0 flex-col items-stretch justify-center gap-1 px-1.5 py-1.5">
                          <button
                            type="button"
                            onClick={() => onSave(row)}
                            disabled={!hasChanges || !draft.recipe_id}
                            className={cn(
                              'flex h-9 min-h-9 shrink-0 items-center justify-center gap-1 rounded-md text-xs font-bold transition-colors',
                              !hasChanges || !draft.recipe_id
                                ? 'cursor-not-allowed bg-zinc-100 text-zinc-400'
                                : 'bg-[#36606F] text-white hover:bg-[#2A4B57]'
                            )}
                            title="Guardar"
                          >
                            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(row)}
                            disabled={!row.mapped}
                            className={cn(
                              'flex h-9 min-h-9 shrink-0 items-center justify-center rounded-md border text-rose-600 transition-colors',
                              row.mapped
                                ? 'border-rose-200 bg-rose-50 hover:bg-rose-100'
                                : 'cursor-not-allowed border-zinc-100 bg-zinc-50 text-zinc-300'
                            )}
                            title="Eliminar mapeo"
                            aria-label="Eliminar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {rows.length === 0 ? (
                  <div className="px-3 py-8 text-center text-xs text-zinc-500">Sin resultados.</div>
                ) : null}
              </div>
            </div>
          </section>
        ))}

        {grouped.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500 shadow-sm">
            No hay artículos que coincidan.
          </div>
        ) : null}
      </div>
    </div>
  )
}

function AlbaranNamesCompact({ list, hasRecipe }: { list: AlbaranLearnedName[]; hasRecipe: boolean }) {
  if (!hasRecipe || list.length === 0) {
    return <span className="block text-center text-sm text-zinc-300">—</span>
  }
  return (
    <ul className="max-h-[5.5rem] space-y-0.5 overflow-y-auto text-[11px] leading-tight text-zinc-800">
      {list.map((item) => (
        <li
          key={`${item.ingredient_id}-${item.supplier_name ?? ''}-${item.supplier_item_name}`}
          className="truncate border-l-2 border-sky-200 pl-1.5"
          title={item.supplier_name ? `${item.supplier_item_name} (${item.supplier_name})` : item.supplier_item_name}
        >
          <span className="font-medium text-zinc-900">{item.supplier_item_name}</span>
          {item.supplier_name ? (
            <span className="text-zinc-500"> · {item.supplier_name}</span>
          ) : null}
        </li>
      ))}
    </ul>
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
        'h-9 min-h-9 shrink-0 rounded-md px-3 text-xs font-semibold transition-colors',
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
}: {
  recipes: Recipe[]
  selectedId: string | null
  onSelect: (id: string) => void
  onClear: () => void
  compact?: boolean
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

  const h = compact ? 'h-9 min-h-9' : 'h-12 min-h-12'
  const btnPad = compact ? 'px-2 text-xs' : 'px-4 text-sm'
  const clearW = compact ? 'w-9 min-w-9' : 'w-12 min-w-12'

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className={cn(
            'flex w-full items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white text-left shadow-sm transition-colors hover:bg-zinc-50',
            h,
            btnPad
          )}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <span className={cn('min-w-0 truncate font-semibold', selectedRecipe ? 'text-zinc-900' : 'text-zinc-400')}>
            {selectedRecipe ? selectedRecipe.name : 'Receta…'}
          </span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-zinc-400 transition-transform', isOpen && 'rotate-180')} />
        </button>

        <button
          type="button"
          onClick={() => {
            onClear()
            setIsOpen(false)
            setSearch('')
          }}
          className={cn(
            'flex shrink-0 items-center justify-center rounded-md border transition-colors',
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
          <X className="h-4 w-4" />
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
