'use client'

import Link from 'next/link'
import { useMemo, useRef, useState, useTransition, useEffect } from 'react'
import { toast } from 'sonner'
import {
  BookOpen,
  Check,
  ClipboardSignature,
  Loader2,
  Search,
  Trash2,
  ChevronDown,
  X,
  Truck,
} from 'lucide-react'
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

function formatStatCount(n: number): string {
  if (n === 0) return '\u00a0'
  return String(n)
}

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

  const counts = useMemo(() => {
    let mapped = 0
    let withAlbaranHint = 0
    for (const r of uiRows) {
      if (r.mapped) mapped += 1
      if (r.recipe_id && (albaranLearnedByRecipeId[r.recipe_id]?.length ?? 0) > 0) withAlbaranHint += 1
    }
    return { total: uiRows.length, mapped, withAlbaranHint }
  }, [uiRows, albaranLearnedByRecipeId])

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
    <div className="space-y-5">
      <section className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <h2 className="text-sm font-black uppercase tracking-wide text-zinc-500">Cómo leer esta pantalla</h2>
            <ul className="list-inside list-disc space-y-1.5 text-sm leading-relaxed text-zinc-700">
              <li>
                <span className="font-semibold text-zinc-900">Columna TPV</span>: artículo del terminal; es lo que
                aparece en el ticket.
              </li>
              <li>
                <span className="font-semibold text-zinc-900">Receta + factor</span>: qué escandallo descuenta el
                stock al vender ese artículo (factor = raciones por unidad TPV).
              </li>
              <li>
                <span className="font-semibold text-zinc-900">Nombres en albarán</span>: textos ya aprendidos en{' '}
                <Link href="/dashboard/albaranes" className="font-semibold text-[#36606F] underline-offset-2 hover:underline">
                  albaranes
                </Link>{' '}
                para ingredientes de la receta elegida (varios proveedores o variantes de nombre).
              </li>
            </ul>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 lg:flex-col lg:items-stretch">
            <div className="flex min-h-12 min-w-[9rem] flex-1 items-center justify-between gap-3 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-2 lg:flex-initial">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Artículos</span>
              <span className="text-lg font-black tabular-nums text-zinc-900">{formatStatCount(counts.total)}</span>
            </div>
            <div className="flex min-h-12 min-w-[9rem] flex-1 items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/80 px-4 py-2 lg:flex-initial">
              <span className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Con receta</span>
              <span className="text-lg font-black tabular-nums text-emerald-900">{formatStatCount(counts.mapped)}</span>
            </div>
            <div className="flex min-h-12 min-w-[9rem] flex-1 items-center justify-between gap-3 rounded-xl border border-sky-100 bg-sky-50/80 px-4 py-2 lg:flex-initial">
              <span className="text-xs font-semibold uppercase tracking-wide text-sky-900">Con texto albarán</span>
              <span className="text-lg font-black tabular-nums text-sky-950">
                {formatStatCount(counts.withAlbaranHint)}
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-md lg:flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
          <input
            className="h-12 w-full rounded-xl border border-zinc-200 bg-white pl-12 pr-4 text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5B8FB9]"
            placeholder="Buscar por artículo TPV, ID, receta o texto de albarán…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar en mapeos TPV"
          />
        </div>

        <div className="flex shrink-0 rounded-xl bg-zinc-100 p-1.5 shadow-inner">
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

      <div className="space-y-4">
        {grouped.map(({ family, rows }) => (
          <section key={family} className="overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-sm">
            <header className="flex items-center justify-between gap-3 border-b border-zinc-100 bg-zinc-50/60 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-800">{family}</p>
                <p className="mt-0.5 text-xs text-zinc-500">Agrupación por familia BDP</p>
              </div>
              <div className="shrink-0 rounded-full bg-zinc-200 px-2.5 py-1 text-xs font-semibold text-zinc-700">
                {rows.length}
              </div>
            </header>

            <div className="hidden xl:grid xl:grid-cols-12 xl:gap-4 xl:border-b xl:border-zinc-100 xl:bg-zinc-50/40 xl:px-4 xl:py-2.5">
              <div className="col-span-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                <ClipboardSignature className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
                Artículo TPV
              </div>
              <div className="col-span-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                <BookOpen className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
                Receta y factor
              </div>
              <div className="col-span-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                <Truck className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
                Nombres en albarán
              </div>
              <div className="col-span-2 text-right text-xs font-semibold uppercase tracking-wide text-zinc-600">
                Acciones
              </div>
            </div>

            <div className="divide-y divide-zinc-100">
              {rows.map((row) => {
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
                      'px-4 py-4 transition-opacity xl:grid xl:grid-cols-12 xl:items-start xl:gap-4 xl:py-4',
                      isBusy && 'pointer-events-none opacity-60'
                    )}
                  >
                    <div className="xl:col-span-3">
                      <div className="mb-3 flex items-start justify-between gap-2 xl:mb-0">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-semibold text-zinc-900">{row.nombre}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs text-zinc-500">ID {row.articulo_id}</span>
                            {row.departamento ? (
                              <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                                {row.departamento}
                              </span>
                            ) : null}
                            <span
                              className={cn(
                                'rounded-md px-2 py-0.5 text-xs font-semibold',
                                row.mapped ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
                              )}
                            >
                              {row.mapped ? 'Con receta' : 'Sin receta'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mb-3 space-y-2 rounded-xl border border-zinc-100 bg-zinc-50/50 p-3 xl:col-span-4 xl:mb-0 xl:border-0 xl:bg-transparent xl:p-0">
                      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 xl:hidden">
                        <BookOpen className="h-4 w-4" aria-hidden />
                        Receta y factor
                      </p>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                        <div className="min-w-0 flex-1">
                          <RecipeCombobox
                            recipes={recipes}
                            selectedId={draft.recipe_id}
                            onSelect={(id) => setDraft(row.articulo_id, { recipe_id: id })}
                            onClear={() => setDraft(row.articulo_id, { recipe_id: null })}
                          />
                          {row.recipe_name && draft.recipe_id === row.recipe_id ? (
                            <p className="mt-1.5 text-xs text-zinc-500">
                              Guardado: <span className="font-medium text-zinc-700">{row.recipe_name}</span>
                            </p>
                          ) : null}
                        </div>
                        <div className="w-full shrink-0 sm:w-28">
                          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                            Factor
                          </label>
                          <input
                            className="h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-center text-base font-semibold text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5B8FB9]"
                            type="number"
                            step="0.01"
                            min="0.01"
                            inputMode="decimal"
                            value={draft.factor}
                            onChange={(e) => setDraft(row.articulo_id, { factor: e.target.value })}
                            aria-label={`Factor de porción para ${row.nombre}`}
                          />
                        </div>
                      </div>
                      <p className="text-[11px] leading-snug text-zinc-500">
                        1 = una unidad TPV descuenta una vez el escandallo según la receta.
                      </p>
                    </div>

                    <div className="mb-3 xl:col-span-3 xl:mb-0">
                      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 xl:hidden">
                        <Truck className="h-4 w-4" aria-hidden />
                        Nombres en albarán
                      </p>
                      <AlbaranNamesPanel list={albaranList} hasRecipe={Boolean(rid)} />
                    </div>

                    <div className="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-100 pt-3 xl:col-span-2 xl:border-t-0 xl:pt-0">
                      <button
                        type="button"
                        onClick={() => onSave(row)}
                        disabled={!hasChanges || !draft.recipe_id}
                        className={cn(
                          'flex h-12 min-w-[7.5rem] shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors',
                          !hasChanges || !draft.recipe_id
                            ? 'cursor-not-allowed bg-zinc-100 text-zinc-400'
                            : 'bg-[#36606F] text-white shadow-sm hover:bg-[#2A4B57]'
                        )}
                        title="Guardar mapeo TPV → receta"
                      >
                        {isBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                        Guardar
                      </button>

                      <button
                        type="button"
                        onClick={() => onDelete(row)}
                        disabled={!row.mapped}
                        className={cn(
                          'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition-colors',
                          row.mapped
                            ? 'border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100'
                            : 'cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-300'
                        )}
                        title="Quitar mapeo"
                        aria-label={`Eliminar mapeo de ${row.nombre}`}
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

function AlbaranNamesPanel({ list, hasRecipe }: { list: AlbaranLearnedName[]; hasRecipe: boolean }) {
  if (!hasRecipe) {
    return (
      <div className="min-h-[3rem] rounded-xl border border-dashed border-zinc-200 bg-zinc-50/80 px-3 py-2.5 text-xs leading-relaxed text-zinc-500">
        Elige una receta para ver aquí los textos de albarán ya guardados para sus ingredientes.
      </div>
    )
  }
  if (list.length === 0) {
    return (
      <div className="min-h-[3rem] rounded-xl border border-dashed border-amber-100 bg-amber-50/50 px-3 py-2.5 text-xs leading-relaxed text-amber-950">
        Aún no hay nombres de proveedor/albarán enlazados a los ingredientes de esta receta. Cuando confirmes líneas
        en{' '}
        <Link href="/dashboard/albaranes" className="font-semibold underline-offset-2 hover:underline">
          Albaranes
        </Link>
        , aparecerán aquí.
      </div>
    )
  }
  return (
    <div className="max-h-40 overflow-y-auto rounded-xl border border-zinc-100 bg-white p-2 shadow-inner">
      <ul className="flex flex-col gap-1.5">
        {list.map((item) => (
          <li
            key={`${item.ingredient_id}-${item.supplier_name ?? ''}-${item.supplier_item_name}`}
            className="rounded-lg bg-zinc-50 px-2.5 py-2 text-xs leading-snug text-zinc-800"
          >
            <span className="font-semibold text-zinc-900">{item.supplier_item_name}</span>
            {item.supplier_name ? (
              <span className="mt-0.5 block text-[11px] text-zinc-500">Proveedor: {item.supplier_name}</span>
            ) : null}
          </li>
        ))}
      </ul>
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
        'h-[38px] min-h-[38px] rounded-lg px-5 text-sm font-semibold transition-colors',
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
          className="flex h-12 min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 text-left shadow-sm transition-colors hover:bg-zinc-50"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <span className={cn('min-w-0 truncate font-semibold', selectedRecipe ? 'text-zinc-900' : 'text-zinc-400')}>
            {selectedRecipe ? selectedRecipe.name : 'Seleccionar receta…'}
          </span>
          <ChevronDown className={cn('h-5 w-5 shrink-0 text-zinc-400 transition-transform', isOpen && 'rotate-180')} />
        </button>

        <button
          type="button"
          onClick={() => {
            onClear()
            setIsOpen(false)
            setSearch('')
          }}
          className={cn(
            'flex h-12 min-h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition-colors',
            selectedId
              ? 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100'
              : 'cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-300'
          )}
          disabled={!selectedId}
          title="Quitar receta"
          aria-label="Quitar receta seleccionada"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {isOpen ? (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl">
          <div className="border-b border-zinc-100 bg-zinc-50 p-2">
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
              <ul className="py-1" role="listbox">
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
                        'w-full px-4 py-3 text-left text-sm font-semibold transition-colors hover:bg-zinc-100',
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
