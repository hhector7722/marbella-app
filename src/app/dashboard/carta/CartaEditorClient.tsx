'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Check, Loader2, Search, Trash2, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { deleteMenuOverride, upsertMenuOverride } from './actions'
import type { CartaEditorMappingRow, CartaOverrideRow } from './types'

type UiRow = {
  articulo_id: number
  familia: string
  tpv_nombre: string
  recipe_name: string
  recipe_photo_url: string | null
  override: CartaOverrideRow | null
}

export default function CartaEditorClient({
  mappings,
  overrides,
}: {
  mappings: CartaEditorMappingRow[]
  overrides: CartaOverrideRow[]
}) {
  const [query, setQuery] = useState('')
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<number | null>(null)
  const [drafts, setDrafts] = useState<
    Record<
      number,
      {
        is_hidden: boolean
        sort_order: string
        override_nombre: string
        override_descripcion: string
        override_precio: string
        override_photo_url: string
      }
    >
  >({})

  const overrideByArticulo = useMemo(() => {
    const m = new Map<number, CartaOverrideRow>()
    for (const o of overrides) m.set(o.articulo_id, o)
    return m
  }, [overrides])

  const uiRows = useMemo<UiRow[]>(() => {
    const rows: UiRow[] = []
    for (const m of mappings) {
      const a = m.bdp_articulos
      const r = m.recipes
      if (!a || !r) continue
      const familia = a.bdp_familias?.nombre ?? (a.familia_id != null ? `Familia ${a.familia_id}` : 'Sin familia')
      rows.push({
        articulo_id: m.articulo_id,
        familia,
        tpv_nombre: a.nombre,
        recipe_name: r.name,
        recipe_photo_url: r.photo_url ?? null,
        override: overrideByArticulo.get(m.articulo_id) ?? null,
      })
    }
    return rows
  }, [mappings, overrideByArticulo])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return uiRows
    return uiRows.filter(
      (r) =>
        r.tpv_nombre.toLowerCase().includes(q) ||
        r.recipe_name.toLowerCase().includes(q) ||
        String(r.articulo_id).includes(q)
    )
  }, [uiRows, query])

  const grouped = useMemo(() => {
    const groups = new Map<string, UiRow[]>()
    for (const r of filtered) {
      const list = groups.get(r.familia) ?? []
      list.push(r)
      groups.set(r.familia, list)
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([family, rows]) => {
        const sorted = rows.slice().sort((x, y) => {
          const xo = x.override?.sort_order
          const yo = y.override?.sort_order
          if (xo == null && yo == null) return x.tpv_nombre.localeCompare(y.tpv_nombre)
          if (xo == null) return 1
          if (yo == null) return -1
          return xo - yo
        })
        return { family, rows: sorted }
      })
  }, [filtered])

  const getDraft = (row: UiRow) => {
    const existing = drafts[row.articulo_id]
    if (existing) return existing

    return {
      is_hidden: row.override?.is_hidden ?? false,
      sort_order: row.override?.sort_order != null ? String(row.override.sort_order) : '',
      override_nombre: row.override?.override_nombre ?? '',
      override_descripcion: row.override?.override_descripcion ?? '',
      override_precio: row.override?.override_precio != null ? String(row.override.override_precio) : '',
      override_photo_url: row.override?.override_photo_url ?? '',
    }
  }

  const setDraft = (
    articulo_id: number,
    next: Partial<{
      is_hidden: boolean
      sort_order: string
      override_nombre: string
      override_descripcion: string
      override_precio: string
      override_photo_url: string
    }>
  ) => {
    setDrafts((prev) => {
      const current =
        prev[articulo_id] ??
        ({
          is_hidden: false,
          sort_order: '',
          override_nombre: '',
          override_descripcion: '',
          override_precio: '',
          override_photo_url: '',
        } as const)
      return { ...prev, [articulo_id]: { ...current, ...next } }
    })
  }

  const hasChanges = (row: UiRow) => {
    const d = getDraft(row)
    const o = row.override
    const sort = d.sort_order.trim() === '' ? null : Number(d.sort_order)
    const precio = d.override_precio.trim() === '' ? null : Number(d.override_precio)
    return (
      (o?.is_hidden ?? false) !== d.is_hidden ||
      (o?.sort_order ?? null) !== sort ||
      (o?.override_nombre ?? null) !== emptyToNull(d.override_nombre) ||
      (o?.override_descripcion ?? null) !== emptyToNull(d.override_descripcion) ||
      (o?.override_precio ?? null) !== precio ||
      (o?.override_photo_url ?? null) !== emptyToNull(d.override_photo_url)
    )
  }

  const onSave = async (row: UiRow) => {
    const d = getDraft(row)
    const sort = d.sort_order.trim() === '' ? null : Number(d.sort_order)
    const precio = d.override_precio.trim() === '' ? null : Number(d.override_precio)

    if (sort != null && (!Number.isFinite(sort) || sort < 0 || !Number.isInteger(sort))) {
      toast.error('Orden inválido (usa un entero ≥ 0, o vacío).')
      return
    }
    if (precio != null && (!Number.isFinite(precio) || precio < 0)) {
      toast.error('Precio inválido (usa número ≥ 0, o vacío).')
      return
    }

    setBusyId(row.articulo_id)
    startTransition(async () => {
      const res = await upsertMenuOverride({
        articulo_id: row.articulo_id,
        is_hidden: d.is_hidden,
        sort_order: sort,
        override_nombre: emptyToNull(d.override_nombre),
        override_descripcion: emptyToNull(d.override_descripcion),
        override_precio: precio,
        override_photo_url: emptyToNull(d.override_photo_url),
      })
      setBusyId(null)
      if (!res.success) {
        toast.error(res.error ?? 'Error guardando la carta')
        return
      }
      toast.success('Carta guardada.')
    })
  }

  const onReset = async (row: UiRow) => {
    setBusyId(row.articulo_id)
    startTransition(async () => {
      const res = await deleteMenuOverride(row.articulo_id)
      setBusyId(null)
      if (!res.success) {
        toast.error(res.error ?? 'Error reseteando el override')
        return
      }
      toast.success('Override eliminado.')
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:w-[520px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
          <input
            className="h-12 w-full rounded-xl border border-zinc-200 bg-white pl-12 pr-4 text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5B8FB9]"
            placeholder="Buscar por TPV, receta o ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="text-xs text-zinc-500">
          Consejo: si quieres ocultar un plato, actívalo en <span className="font-semibold">Visible</span>.
        </div>
      </div>

      <div className="space-y-4">
        {grouped.map(({ family, rows }) => (
          <section key={family} className="overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-100 bg-zinc-50/60 px-4 py-3">
              <div className="truncate text-sm font-semibold text-zinc-800">{family}</div>
              <div className="shrink-0 rounded-full bg-zinc-200 px-2.5 py-1 text-xs font-semibold text-zinc-700">
                {rows.length}
              </div>
            </div>

            <div className="divide-y divide-zinc-100">
              {rows.map((row) => {
                const d = getDraft(row)
                const isBusy = busyId === row.articulo_id || (isPending && busyId === row.articulo_id)
                const changed = hasChanges(row)

                return (
                  <div
                    key={row.articulo_id}
                    className={cn(
                      'px-4 py-4 grid grid-cols-1 gap-3 md:grid-cols-12 md:gap-4',
                      isBusy && 'opacity-60 pointer-events-none'
                    )}
                  >
                    <div className="md:col-span-4">
                      <div className="font-semibold text-zinc-900 truncate">{row.tpv_nombre}</div>
                      <div className="mt-1 text-xs text-zinc-500">
                        <span className="font-mono">ID {row.articulo_id}</span>
                        <span className="mx-2 text-zinc-300">·</span>
                        <span className="text-zinc-600">{row.recipe_name}</span>
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <button
                        type="button"
                        onClick={() => setDraft(row.articulo_id, { is_hidden: !d.is_hidden })}
                        className={cn(
                          'h-12 w-full rounded-xl border shadow-sm flex items-center justify-center gap-2 font-semibold transition-colors',
                          d.is_hidden
                            ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        )}
                        title={d.is_hidden ? 'Oculto' : 'Visible'}
                      >
                        {d.is_hidden ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        {d.is_hidden ? 'Oculto' : 'Visible'}
                      </button>
                    </div>

                    <div className="md:col-span-2">
                      <input
                        className="h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-center font-semibold text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5B8FB9]"
                        placeholder="Orden"
                        inputMode="numeric"
                        value={d.sort_order}
                        onChange={(e) => setDraft(row.articulo_id, { sort_order: e.target.value })}
                      />
                      <div className="mt-1 text-[11px] text-zinc-400">Vacío = automático</div>
                    </div>

                    <div className="md:col-span-4 grid grid-cols-1 gap-3">
                      <input
                        className="h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5B8FB9]"
                        placeholder="Nombre (override)"
                        value={d.override_nombre}
                        onChange={(e) => setDraft(row.articulo_id, { override_nombre: e.target.value })}
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                          className="h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5B8FB9]"
                          placeholder="Precio (override)"
                          inputMode="decimal"
                          value={d.override_precio}
                          onChange={(e) => setDraft(row.articulo_id, { override_precio: e.target.value })}
                        />
                        <input
                          className="h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5B8FB9]"
                          placeholder="Foto URL (override)"
                          value={d.override_photo_url}
                          onChange={(e) => setDraft(row.articulo_id, { override_photo_url: e.target.value })}
                        />
                      </div>
                      <textarea
                        className="min-h-[96px] w-full rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#5B8FB9]"
                        placeholder="Descripción (override)"
                        value={d.override_descripcion}
                        onChange={(e) => setDraft(row.articulo_id, { override_descripcion: e.target.value })}
                      />
                    </div>

                    <div className="md:col-span-12 flex items-center justify-end gap-2 shrink-0">
                      <button
                        onClick={() => onReset(row)}
                        disabled={!row.override}
                        className={cn(
                          'h-12 px-4 rounded-xl border transition-colors flex items-center justify-center gap-2 font-semibold',
                          row.override
                            ? 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100'
                            : 'border-zinc-200 bg-zinc-50 text-zinc-300 cursor-not-allowed'
                        )}
                        title="Eliminar override"
                      >
                        <Trash2 className="h-5 w-5" />
                        Reset
                      </button>

                      <button
                        onClick={() => onSave(row)}
                        disabled={!changed}
                        className={cn(
                          'h-12 px-5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors',
                          !changed
                            ? 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                            : 'bg-[#36606F] text-white hover:bg-[#2A4B57] shadow-sm'
                        )}
                        title="Guardar"
                      >
                        {isBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                        Guardar
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))}

        {grouped.length === 0 ? (
          <div className="rounded-xl border border-zinc-100 bg-white p-10 text-center text-sm text-zinc-500 shadow-sm">
            No hay resultados.
          </div>
        ) : null}
      </div>
    </div>
  )
}

function emptyToNull(v: string) {
  const t = v.trim()
  return t === '' ? null : t
}

