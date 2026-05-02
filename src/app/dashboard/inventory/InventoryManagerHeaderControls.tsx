'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { saveIngredientsInventoryVisibility } from './actions'

export type InventoryCatalogRow = {
  id: string
  name: string
  category: string | null
  inventory_visible: boolean
}

function isRowVisible(row: InventoryCatalogRow): boolean {
  return row.inventory_visible !== false
}

export function InventoryManagerHeaderControls({ catalog }: { catalog: InventoryCatalogRow[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    const next: Record<string, boolean> = {}
    for (const row of catalog) {
      next[row.id] = isRowVisible(row)
    }
    setDraft(next)
    setQuery('')
  }, [open, catalog])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return catalog.filter((row) => !q || row.name.toLowerCase().includes(q))
  }, [catalog, query])

  const grouped = useMemo(() => {
    return filtered.reduce(
      (acc, row) => {
        const c = (row.category ?? '').trim() || 'Sin categoría'
        ;(acc[c] = acc[c] || []).push(row)
        return acc
      },
      {} as Record<string, InventoryCatalogRow[]>,
    )
  }, [filtered])

  const toggle = (id: string) => {
    setDraft((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const handleSave = async () => {
    const updates = catalog
      .filter((row) => {
        const before = isRowVisible(row)
        const after = draft[row.id] ?? before
        return before !== after
      })
      .map((row) => ({
        ingredient_id: row.id,
        inventory_visible: draft[row.id] ?? isRowVisible(row),
      }))

    if (updates.length === 0) {
      toast.message('Sin cambios que guardar.')
      setOpen(false)
      return
    }

    setSaving(true)
    try {
      await saveIngredientsInventoryVisibility(updates)
      toast.success('Lista de inventario actualizada.')
      setOpen(false)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-[48px] min-w-[48px] flex items-center justify-center text-white/90 hover:text-white transition-colors shrink-0"
        aria-label="Editar lista de inventario"
        title="Editar lista de inventario"
      >
        <Pencil className="w-6 h-6" strokeWidth={2} />
      </button>

      {open ? (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => !saving && setOpen(false)}
        >
          <div
            className={cn(
              'bg-white w-full max-w-xl max-h-[85vh] rounded-2xl shadow-xl border border-zinc-100 overflow-hidden flex flex-col',
              'animate-in zoom-in-95 duration-200',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 bg-[#36606F] text-white">
              <div className="min-w-0">
                <h2 className="text-base font-black uppercase tracking-wider truncate">Visibilidad en inventario</h2>
                <p className="text-[10px] font-bold text-white/70 mt-0.5 uppercase tracking-wide">
                  Activa o desactiva artículos en el recuento
                </p>
              </div>
              <button
                type="button"
                onClick={() => !saving && setOpen(false)}
                className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl text-white hover:bg-white/15 transition-colors shrink-0"
                aria-label="Cerrar"
              >
                <X className="w-6 h-6" strokeWidth={2} />
              </button>
            </div>

            <div className="px-4 pt-3 shrink-0 border-b border-zinc-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full min-h-[48px] pl-10 pr-4 rounded-xl border border-zinc-200 bg-zinc-50/80 text-sm font-medium text-zinc-800 outline-none focus:ring-2 focus:ring-[#36606F]/25 focus:border-[#36606F]/40"
                />
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto px-4 py-3 space-y-5">
              {Object.keys(grouped).length === 0 ? (
                <p className="text-sm text-zinc-500 text-center py-8">Ningún artículo coincide.</p>
              ) : (
                Object.entries(grouped).map(([category, rows]) => (
                  <section key={category} className="flex flex-col gap-2">
                    <div className="text-[11px] font-black uppercase tracking-widest text-zinc-400 px-0.5">{category}</div>
                    <div className="rounded-xl border border-zinc-100 shadow-sm divide-y divide-zinc-100 overflow-hidden bg-white">
                      {rows.map((row) => {
                        const on = draft[row.id] ?? isRowVisible(row)
                        return (
                          <div
                            key={row.id}
                            className="flex items-center justify-between gap-3 min-h-[52px] px-3 py-2 bg-white"
                          >
                            <span className="text-sm font-semibold text-zinc-800 min-w-0 flex-1 truncate" title={row.name}>
                              {row.name}
                            </span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={on}
                              onClick={() => toggle(row.id)}
                              className={cn(
                                'relative shrink-0 inline-flex h-12 w-[4rem] items-center rounded-full p-1 transition-colors',
                                on ? 'bg-emerald-600 justify-end' : 'bg-zinc-200 justify-start',
                              )}
                              title={on ? 'Visible en inventario' : 'Oculto en inventario'}
                            >
                              <span className="h-10 w-10 rounded-full bg-white shadow-md shrink-0 pointer-events-none" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                ))
              )}
            </div>

            <div className="shrink-0 p-4 border-t border-zinc-100 bg-white space-y-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className={cn(
                  'w-full min-h-[48px] rounded-xl font-black uppercase tracking-wider text-sm',
                  'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800',
                  'disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
                )}
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
