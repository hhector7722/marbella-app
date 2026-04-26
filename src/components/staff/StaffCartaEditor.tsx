'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { Check, Loader2, Pencil, Search, X, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { upsertMenuOverride } from '@/app/dashboard/carta/actions'

type MenuItemRow = {
  articulo_id: number
  articulo_nombre: string
  articulo_nombre_raw: string
  precio: number | string | null
  sort_order: number | null
}

type OverrideRow = {
  articulo_id: number
  is_hidden: boolean
  category_id: string | null
  sort_order: number | null
  override_nombre: string | null
}

type Category = {
  id: string
  name: string
  parent_id: string | null
  sort_order: number | null
}

export function StaffCartaEditor({ canEdit }: { canEdit: boolean }) {
  const supabase = useMemo(() => createClient(), [])
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<'active' | 'inactive' | 'all'>('active')
  const [loading, setLoading] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [items, setItems] = useState<MenuItemRow[]>([])
  const [overrides, setOverrides] = useState<OverrideRow[]>([])
  const [categories, setCategories] = useState<Category[]>([])

  const overrideByArticulo = useMemo(() => {
    const m = new Map<number, OverrideRow>()
    for (const o of overrides) m.set(o.articulo_id, o)
    return m
  }, [overrides])

  const parents = useMemo(() => {
    return categories
      .filter((c) => !c.parent_id)
      .slice()
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.name.localeCompare(b.name))
  }, [categories])

  const kidsByParent = useMemo(() => {
    const m = new Map<string, Category[]>()
    for (const c of categories) {
      if (!c.parent_id) continue
      const list = m.get(c.parent_id) ?? []
      list.push(c)
      m.set(c.parent_id, list)
    }
    for (const [k, list] of m) {
      m.set(
        k,
        list
          .slice()
          .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.name.localeCompare(b.name))
      )
    }
    return m
  }, [categories])

  const visibleState = (articulo_id: number) => !(overrideByArticulo.get(articulo_id)?.is_hidden ?? false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((it) => {
      const isVisible = visibleState(it.articulo_id)
      if (tab === 'active' && !isVisible) return false
      if (tab === 'inactive' && isVisible) return false
      if (!q) return true
      return (
        it.articulo_nombre.toLowerCase().includes(q) ||
        String(it.articulo_id).includes(q) ||
        (overrideByArticulo.get(it.articulo_id)?.category_id ?? '').toLowerCase().includes(q)
      )
    })
  }, [items, query, tab, overrideByArticulo])

  async function load() {
    setLoading(true)
    try {
      // OJO: v_digital_menu_items filtra ocultos, por eso un "desactivado" no aparecería.
      // Aquí cargamos el catálogo de carta desde:
      // - map_tpv_receta + bdp_articulos (todos los mapeados)
      // - overrides (para saber oculto/categoría)
      // - categories menú
      const [mappingsRes, overridesRes, categoriesRes] = await Promise.all([
        supabase
          .from('map_tpv_receta')
          .select(
            'articulo_id, factor_porcion, bdp_articulos(id, nombre, precio_base)'
          )
          .limit(5000),
        supabase.from('digital_menu_overrides').select('articulo_id, is_hidden, category_id, sort_order, override_nombre').limit(5000),
        supabase
          .from('categories')
          .select('id, name, parent_id, sort_order')
          .eq('scope', 'menu')
          .limit(5000),
      ])

      if (mappingsRes.error) throw mappingsRes.error
      if (overridesRes.error) throw overridesRes.error
      if (categoriesRes.error) throw categoriesRes.error

      const rows = (mappingsRes.data ?? []) as any[]
      setItems(
        rows
          .map((r) => {
            const a = r.bdp_articulos
            if (!a) return null
            return {
              articulo_id: r.articulo_id,
              articulo_nombre: a.nombre,
              articulo_nombre_raw: a.nombre,
              precio: a.precio_base ?? null,
              sort_order: null,
            } satisfies MenuItemRow
          })
          .filter(Boolean) as any
      )
      setOverrides((overridesRes.data ?? []) as any)
      setCategories((categoriesRes.data ?? []) as any)
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo cargar el editor de carta')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const onToggleVisible = (articulo_id: number) => {
    const current = overrideByArticulo.get(articulo_id)
    const nextHidden = !(current?.is_hidden ?? false) // si estaba visible -> ocultar
    startTransition(async () => {
      const res = await upsertMenuOverride({
        articulo_id,
        is_hidden: nextHidden,
        sort_order: current?.sort_order ?? null,
        category_id: current?.category_id ?? null,
        override_nombre: current?.override_nombre ?? null,
        override_descripcion: null,
        override_precio: null,
        override_photo_url: null,
      })
      if (!res.success) {
        toast.error(res.error ?? 'No se pudo guardar')
        return
      }
      toast.success(nextHidden ? 'Desactivado (oculto)' : 'Activado (visible)')
      await load()
    })
  }

  const onSetCategory = (articulo_id: number, category_id: string | null) => {
    const current = overrideByArticulo.get(articulo_id)
    startTransition(async () => {
      const res = await upsertMenuOverride({
        articulo_id,
        is_hidden: current?.is_hidden ?? false,
        sort_order: current?.sort_order ?? null,
        category_id,
        override_nombre: current?.override_nombre ?? null,
        override_descripcion: null,
        override_precio: null,
        override_photo_url: null,
      })
      if (!res.success) {
        toast.error(res.error ?? 'No se pudo guardar categoría')
        return
      }
      toast.success('Categoría guardada')
      await load()
    })
  }

  const onSetCartaNombre = (articulo_id: number, override_nombre: string) => {
    const current = overrideByArticulo.get(articulo_id)
    startTransition(async () => {
      const res = await upsertMenuOverride({
        articulo_id,
        is_hidden: current?.is_hidden ?? false,
        sort_order: current?.sort_order ?? null,
        category_id: current?.category_id ?? null,
        override_nombre: override_nombre.trim() === '' ? null : override_nombre,
        override_descripcion: null,
        override_precio: null,
        override_photo_url: null,
      })
      if (!res.success) {
        toast.error(res.error ?? 'No se pudo guardar el nombre')
        return
      }
      toast.success('Nombre guardado')
      await load()
    })
  }

  if (!canEdit) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-zinc-100 bg-white p-3 text-[#36606F] shadow-sm active:scale-[0.98]"
        aria-label="Editar carta"
        title="Editar carta"
      >
        <Pencil className="h-5 w-5" strokeWidth={2.5} />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm p-3 md:p-6"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-label="Editar carta"
        >
          <div
            className="mx-auto flex h-[min(92vh,900px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 bg-[#36606F] px-4 py-3 text-white">
              <div className="min-w-0">
                <div className="text-xs font-black uppercase tracking-widest">Edición de carta</div>
                <div className="text-[10px] font-semibold text-white/70">Activar/desactivar + categorías</div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl bg-white/10 hover:bg-white/20"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" strokeWidth={2.5} />
              </button>
            </div>

            <div className="flex flex-col gap-3 p-4">
              <div className="relative w-full">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
                <input
                  className="h-12 w-full rounded-xl border border-zinc-200 bg-white pl-12 pr-4 text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5B8FB9]"
                  placeholder="Buscar producto…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>

              <div className="flex shrink-0 rounded-xl bg-zinc-100 p-1.5 shadow-inner">
                <TabButton active={tab === 'active'} onClick={() => setTab('active')}>
                  Activos
                </TabButton>
                <TabButton active={tab === 'inactive'} onClick={() => setTab('inactive')}>
                  Desactivados
                </TabButton>
                <TabButton active={tab === 'all'} onClick={() => setTab('all')}>
                  Todos
                </TabButton>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-0">
              {loading ? (
                <div className="flex items-center justify-center py-10 text-sm font-semibold text-zinc-500">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Cargando…
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map((it) => {
                    const isVisible = visibleState(it.articulo_id)
                    const current = overrideByArticulo.get(it.articulo_id)
                    return (
                      <div
                        key={it.articulo_id}
                        className={cn(
                          'rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm',
                          isPending && 'opacity-70 pointer-events-none'
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-black text-zinc-900">{it.articulo_nombre}</div>
                            <div className="mt-1 text-[11px] font-mono text-zinc-400">ID {it.articulo_id}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onToggleVisible(it.articulo_id)}
                            className={cn(
                              'flex min-h-[48px] items-center gap-2 rounded-xl px-3 font-black uppercase tracking-wider text-[11px]',
                              isVisible
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                            )}
                          >
                            {isVisible ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                            {isVisible ? 'Activo' : 'Off'}
                          </button>
                        </div>

                        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                          <input
                            className="h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5B8FB9]"
                            defaultValue={current?.override_nombre ?? ''}
                            placeholder="Nombre en carta (vacío = TPV)"
                            onBlur={(e) => onSetCartaNombre(it.articulo_id, e.target.value)}
                          />
                          <select
                            className="h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5B8FB9]"
                            value={current?.category_id ?? ''}
                            onChange={(e) => onSetCategory(it.articulo_id, e.target.value ? e.target.value : null)}
                            title="Categoría"
                          >
                            <option value="">Sin categoría</option>
                            {parents.map((p) => {
                              const kids = kidsByParent.get(p.id) ?? []
                              return (
                                <optgroup key={p.id} label={p.name}>
                                  {kids.length
                                    ? kids.map((k) => (
                                        <option key={k.id} value={k.id}>
                                          {k.name}
                                        </option>
                                      ))
                                    : null}
                                </optgroup>
                              )
                            })}
                          </select>

                          <div className="flex items-center justify-end gap-2 text-[11px] font-semibold text-zinc-500">
                            <span className="rounded-xl bg-zinc-100 px-3 py-2">
                              {current?.category_id ? 'Asignado' : 'Sin categoría'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {filtered.length === 0 ? (
                    <div className="rounded-2xl border border-zinc-100 bg-white p-8 text-center text-sm font-semibold text-zinc-500 shadow-sm">
                      Sin resultados.
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-zinc-100 bg-white p-3 text-right">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-[#36606F] px-4 font-black uppercase tracking-wider text-[11px] text-white active:scale-[0.98]"
              >
                <Check className="mr-2 h-5 w-5" />
                Listo
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function TabButton({
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
        'h-[38px] px-5 rounded-lg text-sm font-semibold transition-colors',
        active ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-800'
      )}
    >
      {children}
    </button>
  )
}

