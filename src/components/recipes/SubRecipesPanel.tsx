'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Trash2, Loader2, UtensilsCrossed } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { addComboItem, getComboItems, removeComboItem } from '@/app/dashboard/recipes/actions'

type ComboRow = {
  id: string
  quantity: number
  child_recipe: {
    id: string
    name: string
    category: string | null
    photo_url: string | null
  } | null
}

export function SubRecipesPanel({ recipeId }: { recipeId: string }) {
  const supabase = createClient()
  const [items, setItems] = useState<ComboRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<{ id: string; name: string; category: string | null; photo_url: string | null }[]>([])
  const [searching, setSearching] = useState(false)
  const [qtyStr, setQtyStr] = useState('1')
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getComboItems(recipeId)
      const rows = (data || []) as {
        id: string
        quantity: number
        child_recipe: ComboRow['child_recipe'] | ComboRow['child_recipe'][] | null
      }[]
      setItems(
        rows.map((row) => ({
          ...row,
          child_recipe: Array.isArray(row.child_recipe) ? row.child_recipe[0] ?? null : row.child_recipe,
        }))
      )
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al cargar sub-recetas')
    } finally {
      setLoading(false)
    }
  }, [recipeId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const q = search.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    let cancelled = false
    setSearching(true)
    const t = setTimeout(async () => {
      const { data, error } = await supabase
        .from('recipes')
        .select('id, name, category, photo_url')
        .neq('id', recipeId)
        .ilike('name', `%${q}%`)
        .order('name')
        .limit(24)
      if (!cancelled) {
        setSearching(false)
        if (error) {
          toast.error(error.message)
          setResults([])
        } else setResults(data || [])
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [search, recipeId, supabase])

  const handleAdd = async () => {
    if (!selectedChildId) {
      toast.error('Elige una receta de la lista')
      return
    }
    const quantity = parseFloat(qtyStr.replace(',', '.'))
    if (Number.isNaN(quantity) || quantity <= 0) {
      toast.error('Cantidad debe ser mayor que 0')
      return
    }
    setPending(true)
    try {
      await addComboItem(recipeId, selectedChildId, quantity)
      toast.success('Sub-receta añadida')
      setSearch('')
      setResults([])
      setSelectedChildId(null)
      setQtyStr('1')
      await load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al añadir')
    } finally {
      setPending(false)
    }
  }

  const handleRemove = async (row: ComboRow) => {
    try {
      await removeComboItem(row.id, recipeId)
      toast.success('Eliminada del menú')
      await load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Error al eliminar')
    }
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-zinc-100 bg-white shadow-sm overflow-hidden',
        'md:col-span-2'
      )}
    >
      <div className="bg-[#36606F] px-4 py-2 shrink-0 flex items-center gap-2">
        <UtensilsCrossed className="w-3.5 h-3.5 text-white/80" />
        <h2 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Sub-recetas del menú</h2>
      </div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_minmax(120px,140px)] gap-3 items-end">
          <div className="min-w-0">
            <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Buscar receta</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Escribe al menos 2 caracteres…"
              className="w-full min-h-12 px-3 rounded-lg border border-zinc-200 text-sm focus:ring-2 focus:ring-[#36606F]/30 focus:border-[#36606F] outline-none"
            />
            {search.trim().length >= 2 && (
              <div className="mt-1 rounded-lg border border-zinc-100 bg-zinc-50/80 max-h-48 overflow-y-auto custom-scrollbar">
                {searching && (
                  <div className="flex items-center gap-2 px-3 py-3 text-zinc-500 text-xs">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Buscando…
                  </div>
                )}
                {!searching &&
                  results.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedChildId(r.id)}
                      className={cn(
                        'w-full min-h-12 px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-white transition-colors border-b border-zinc-100 last:border-0',
                        selectedChildId === r.id && 'bg-[#36606F]/10 ring-1 ring-inset ring-[#36606F]/20'
                      )}
                    >
                      {r.photo_url ? (
                        <img src={r.photo_url} alt="" className="w-8 h-8 rounded object-contain bg-white border border-zinc-100 shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-zinc-200 shrink-0" />
                      )}
                      <span className="font-bold text-zinc-800 truncate">{r.name}</span>
                      {r.category && <span className="text-[10px] text-zinc-400 shrink-0">{r.category}</span>}
                    </button>
                  ))}
                {!searching && results.length === 0 && (
                  <div className="px-3 py-3 text-xs text-zinc-400">Sin coincidencias</div>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Cantidad</label>
            <input
              type="text"
              inputMode="decimal"
              value={qtyStr}
              onChange={(e) => setQtyStr(e.target.value)}
              className="w-full min-h-12 px-3 rounded-lg border border-zinc-200 text-sm text-center focus:ring-2 focus:ring-[#36606F]/30 outline-none"
            />
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={pending}
            className="min-h-12 rounded-xl bg-[#36606F] text-white text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-[#2d4f5c] disabled:opacity-50 transition-colors shrink-0"
          >
            {pending ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Añadir al menú'}
          </button>
        </div>

        <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-3">
          <div className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-2">Incluidas en el menú</div>
          {loading ? (
            <div className="flex justify-center py-6 text-zinc-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-zinc-500 py-2">Ninguna sub-receta todavía.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((row) => {
                const ch = row.child_recipe
                return (
                  <li
                    key={row.id}
                    className="flex items-center gap-3 rounded-lg border border-zinc-100 bg-white px-3 py-2 shadow-sm"
                  >
                    {ch?.photo_url ? (
                      <img src={ch.photo_url} alt="" className="w-10 h-10 rounded-lg object-contain bg-zinc-50 border border-zinc-100 shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-zinc-100 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-zinc-900 truncate">{ch?.name ?? '—'}</div>
                      <div className="text-xs text-zinc-500">
                        Cantidad: <span className="font-black text-[#36606F]">{row.quantity}</span>
                        {ch?.category && <span className="ml-2 opacity-70">{ch.category}</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemove(row)}
                      className="min-h-12 min-w-12 flex items-center justify-center rounded-lg text-zinc-300 hover:text-rose-600 hover:bg-rose-50 transition-colors shrink-0"
                      aria-label="Quitar sub-receta"
                    >
                      <Trash2 className="w-5 h-5" strokeWidth={2} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
