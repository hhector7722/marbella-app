'use client'

import { useMemo, useRef, useState, useTransition, useEffect } from 'react'
import { toast } from 'sonner'
import { Check, Loader2, Search, Trash2, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MappingRow, Recipe, TpvArticle } from './page'
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

export default function MappingClient({
  mappings,
  articles,
  recipes,
}: {
  mappings: MappingRow[]
  articles: TpvArticle[]
  recipes: Recipe[]
}) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [isPending, startTransition] = useTransition()

  // Local editable state per articulo_id (receta + factor)
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
        departamento: a.bdp_departamentos?.nombre ?? (a.departamento_id != null ? `Dept ${a.departamento_id}` : null),
        mapped: mapping != null,
        recipe_id: mapping?.recipe_id ?? null,
        recipe_name: mapping?.recipe_name ?? null,
        factor_porcion: mapping?.factor_porcion ?? 1,
      })
    }
    return rows
  }, [articles, mappingByArticulo])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return uiRows.filter((r) => {
      if (status === 'mapped' && !r.mapped) return false
      if (status === 'unmapped' && r.mapped) return false
      if (!q) return true
      return r.nombre.toLowerCase().includes(q) || String(r.articulo_id).includes(q)
    })
  }, [uiRows, query, status])

  const grouped = useMemo(() => {
    // Bento grouping by familia if available
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
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:w-[420px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
          <input
            className="h-12 w-full rounded-xl border border-zinc-200 bg-white pl-12 pr-4 text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5B8FB9]"
            placeholder="Buscar artículo TPV por nombre o ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="flex shrink-0 rounded-xl bg-zinc-100 p-1.5 shadow-inner">
          <FilterButton active={status === 'all'} onClick={() => setStatus('all')}>
            Todos
          </FilterButton>
          <FilterButton active={status === 'mapped'} onClick={() => setStatus('mapped')}>
            Mapeados
          </FilterButton>
          <FilterButton active={status === 'unmapped'} onClick={() => setStatus('unmapped')}>
            Sin Receta
          </FilterButton>
        </div>
      </div>

      {/* Bento groups */}
      <div className="space-y-4">
        {grouped.map(({ family, rows }) => (
          <section key={family} className="rounded-xl border border-zinc-100 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-100 bg-zinc-50/60 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-zinc-800">{family}</div>
              </div>
              <div className="shrink-0 rounded-full bg-zinc-200 px-2.5 py-1 text-xs font-semibold text-zinc-700">
                {rows.length}
              </div>
            </div>

            {/* Table header */}
            <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-3 text-xs font-semibold text-zinc-600">
              <div className="col-span-4">Artículo TPV</div>
              <div className="col-span-4">Receta asignada</div>
              <div className="col-span-2">Factor porción</div>
              <div className="col-span-2 text-right">Acciones</div>
            </div>

            <div className="divide-y divide-zinc-100">
              {rows.map((row) => {
                const draft = getDraft(row)
                const isBusy = busyId === row.articulo_id || (isPending && busyId === row.articulo_id)
                const hasChanges =
                  draft.recipe_id !== row.recipe_id || Number(draft.factor) !== Number(row.factor_porcion ?? 1)

                return (
                  <div
                    key={row.articulo_id}
                    className={cn(
                      'grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 px-4 py-4 md:py-3 items-start md:items-center',
                      isBusy && 'opacity-60 pointer-events-none'
                    )}
                  >
                    {/* Col 1 */}
                    <div className="md:col-span-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-zinc-900">{row.nombre}</div>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-500">
                            <span className="font-mono">ID {row.articulo_id}</span>
                            {row.departamento ? (
                              <span className="rounded-md bg-zinc-100 px-2 py-0.5">{row.departamento}</span>
                            ) : null}
                            <span
                              className={cn(
                                'rounded-md px-2 py-0.5',
                                row.mapped ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                              )}
                            >
                              {row.mapped ? 'Mapeado' : 'Sin receta'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Col 2 */}
                    <div className="md:col-span-4">
                      <RecipeCombobox
                        recipes={recipes}
                        selectedId={draft.recipe_id}
                        onSelect={(id) => setDraft(row.articulo_id, { recipe_id: id })}
                        onClear={() => setDraft(row.articulo_id, { recipe_id: null })}
                      />
                      {row.recipe_name && (
                        <div className="mt-1 text-xs text-zinc-400">
                          Actual: <span className="text-zinc-600">{row.recipe_name}</span>
                        </div>
                      )}
                    </div>

                    {/* Col 3 */}
                    <div className="md:col-span-2">
                      <input
                        className="h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-center font-semibold text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5B8FB9]"
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={draft.factor}
                        onChange={(e) => setDraft(row.articulo_id, { factor: e.target.value })}
                      />
                      <div className="mt-1 text-[11px] text-zinc-400">Ej: 1 = 1 unidad TPV</div>
                    </div>

                    {/* Col 4 */}
                    <div className="md:col-span-2 flex items-center justify-end gap-2 shrink-0">
                      <button
                        onClick={() => onSave(row)}
                        disabled={!hasChanges || !draft.recipe_id}
                        className={cn(
                          'h-12 px-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors',
                          !hasChanges || !draft.recipe_id
                            ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                            : 'bg-[#36606F] text-white hover:bg-[#2A4B57] shadow-sm'
                        )}
                        title="Guardar"
                      >
                        {isBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                        <span className="hidden md:inline">Guardar</span>
                      </button>

                      <button
                        onClick={() => onDelete(row)}
                        disabled={!row.mapped}
                        className={cn(
                          'h-12 w-12 rounded-xl border transition-colors flex items-center justify-center',
                          row.mapped
                            ? 'border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100'
                            : 'border-zinc-200 bg-zinc-50 text-zinc-300 cursor-not-allowed'
                        )}
                        title="Eliminar mapeo"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                )
              })}

              {rows.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-zinc-500">Sin resultados en este grupo.</div>
              ) : null}
            </div>
          </section>
        ))}

        {grouped.length === 0 ? (
          <div className="rounded-xl border border-zinc-100 bg-white p-10 text-center text-sm text-zinc-500 shadow-sm">
            No hay artículos que coincidan con los filtros actuales.
          </div>
        ) : null}
      </div>
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
      onClick={onClick}
      className={cn(
        'h-[38px] px-5 rounded-lg text-sm font-semibold transition-colors',
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
}: {
  recipes: Recipe[]
  selectedId: string | null
  onSelect: (id: string) => void
  onClear: () => void
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

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className="h-12 w-full rounded-xl border border-zinc-200 bg-white px-4 text-left shadow-sm hover:bg-zinc-50 transition-colors flex items-center justify-between gap-3"
        >
          <span className={cn('truncate font-semibold', selectedRecipe ? 'text-zinc-900' : 'text-zinc-400')}>
            {selectedRecipe ? selectedRecipe.name : 'Seleccionar receta…'}
          </span>
          <ChevronDown className={cn('h-5 w-5 text-zinc-400 shrink-0 transition-transform', isOpen && 'rotate-180')} />
        </button>

        <button
          type="button"
          onClick={() => {
            onClear()
            setIsOpen(false)
            setSearch('')
          }}
          className={cn(
            'h-12 w-12 rounded-xl border flex items-center justify-center transition-colors',
            selectedId ? 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100' : 'border-zinc-200 bg-zinc-50 text-zinc-300 cursor-not-allowed'
          )}
          disabled={!selectedId}
          title="Quitar receta"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {isOpen ? (
        <div className="absolute z-50 mt-2 w-full rounded-xl border border-zinc-200 bg-white shadow-xl overflow-hidden">
          <div className="p-2 border-b border-zinc-100 bg-zinc-50">
            <input
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#5B8FB9]"
              placeholder="Buscar receta…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="max-h-[260px] overflow-y-auto">
            {filteredRecipes.length === 0 ? (
              <div className="p-4 text-center text-sm text-zinc-500">No hay resultados.</div>
            ) : (
              <ul className="py-1">
                {filteredRecipes.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(r.id)
                        setIsOpen(false)
                        setSearch('')
                      }}
                      className={cn(
                        'w-full px-4 py-3 text-left text-sm font-semibold hover:bg-zinc-100 transition-colors',
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

