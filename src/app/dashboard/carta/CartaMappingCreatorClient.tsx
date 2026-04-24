'use client'

import { useMemo, useRef, useState, useTransition, useEffect } from 'react'
import { toast } from 'sonner'
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { upsertMapping } from '@/app/dashboard/recetas-tpv/actions'

export type CartaRecipe = { id: string; name: string }
export type CartaTpvArticle = {
  id: number
  nombre: string
  familia_id: number | null
  bdp_familias?: { nombre: string } | null
}

export default function CartaMappingCreatorClient({
  unmappedArticles,
  recipes,
}: {
  unmappedArticles: CartaTpvArticle[]
  recipes: CartaRecipe[]
}) {
  const [query, setQuery] = useState('')
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<number | null>(null)
  const [drafts, setDrafts] = useState<Record<number, { recipe_id: string | null }>>({})

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return unmappedArticles
    return unmappedArticles.filter((a) => a.nombre.toLowerCase().includes(q) || String(a.id).includes(q))
  }, [unmappedArticles, query])

  const grouped = useMemo(() => {
    const groups = new Map<string, CartaTpvArticle[]>()
    for (const a of filtered) {
      const family = a.bdp_familias?.nombre ?? (a.familia_id != null ? `Familia ${a.familia_id}` : 'Sin familia')
      const list = groups.get(family) ?? []
      list.push(a)
      groups.set(family, list)
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([family, rows]) => ({ family, rows: rows.sort((x, y) => x.nombre.localeCompare(y.nombre)) }))
  }, [filtered])

  const getDraft = (articulo_id: number) => drafts[articulo_id]?.recipe_id ?? null
  const setDraft = (articulo_id: number, recipe_id: string | null) =>
    setDrafts((p) => ({ ...p, [articulo_id]: { recipe_id } }))

  const onSave = async (articulo_id: number) => {
    const recipeId = getDraft(articulo_id)
    if (!recipeId) {
      toast.error('Selecciona una receta antes de guardar.')
      return
    }

    setBusyId(articulo_id)
    startTransition(async () => {
      // factor_porcion por defecto 1 (1 unidad TPV = 1 receta)
      const res = await upsertMapping(articulo_id, recipeId, 1)
      setBusyId(null)
      if (!res.success) {
        toast.error(res.error ?? 'No se pudo crear el mapeo')
        return
      }
      toast.success('Producto añadido a la carta.')
      // Limpia draft para evitar doble click accidental
      setDraft(articulo_id, null)
    })
  }

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-zinc-50/60 border-b border-zinc-100">
        <div className="text-sm font-black uppercase tracking-widest text-zinc-800">Añadir platos a la carta</div>
        <div className="mt-1 text-[11px] font-semibold text-zinc-500">
          Aquí creas el mapeo TPV→Receta. Sin mapeo, el producto no aparece en la carta.
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="relative w-full md:max-w-[520px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
          <input
            className="h-12 w-full rounded-xl border border-zinc-200 bg-white pl-12 pr-4 text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5B8FB9]"
            placeholder="Buscar artículo TPV por nombre o ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {unmappedArticles.length === 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
            No hay artículos pendientes de mapear. La carta ya tiene todo lo que está en TPV (según mapeos).
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map(({ family, rows }) => (
              <section key={family} className="rounded-xl border border-zinc-100 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-zinc-50/60 border-b border-zinc-100">
                  <div className="truncate text-xs font-black uppercase tracking-widest text-zinc-700">{family}</div>
                  <div className="shrink-0 rounded-full bg-zinc-200 px-2.5 py-1 text-xs font-semibold text-zinc-700">
                    {rows.length}
                  </div>
                </div>
                <div className="divide-y divide-zinc-100">
                  {rows.map((a) => {
                    const selected = getDraft(a.id)
                    const isBusy = busyId === a.id || (isPending && busyId === a.id)
                    return (
                      <div
                        key={a.id}
                        className={cn('grid grid-cols-1 md:grid-cols-12 gap-3 px-4 py-4 items-start', isBusy && 'opacity-60 pointer-events-none')}
                      >
                        <div className="md:col-span-5">
                          <div className="truncate font-semibold text-zinc-900">{a.nombre}</div>
                          <div className="mt-1 text-xs text-zinc-500 font-mono">ID {a.id}</div>
                        </div>
                        <div className="md:col-span-5">
                          <RecipeCombobox
                            recipes={recipes}
                            selectedId={selected}
                            onSelect={(id) => setDraft(a.id, id)}
                            onClear={() => setDraft(a.id, null)}
                          />
                        </div>
                        <div className="md:col-span-2 flex justify-end shrink-0">
                          <button
                            onClick={() => onSave(a.id)}
                            disabled={!selected}
                            className={cn(
                              'h-12 px-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors min-w-[120px]',
                              !selected
                                ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                                : 'bg-[#36606F] text-white hover:bg-[#2A4B57] shadow-sm'
                            )}
                            title="Añadir a la carta"
                          >
                            {isBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                            Añadir
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function RecipeCombobox({
  recipes,
  selectedId,
  onSelect,
  onClear,
}: {
  recipes: CartaRecipe[]
  selectedId: string | null
  onSelect: (id: string) => void
  onClear: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedRecipe = useMemo(() => recipes.find((r) => r.id === selectedId) ?? null, [recipes, selectedId])
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

