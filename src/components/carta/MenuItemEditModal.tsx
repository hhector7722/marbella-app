'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import { upsertMenuOverride } from '@/app/dashboard/carta/actions'

type CategoryRow = {
  id: string
  name: string
  parent_id: string | null
  sort_order: number | null
}

export function MenuItemEditModal({
  open,
  onClose,
  articuloId,
  categories,
}: {
  open: boolean
  onClose: () => void
  articuloId: number | null
  categories: CategoryRow[]
}) {
  const supabase = useMemo(() => createClient(), [])
  const [isPending, startTransition] = useTransition()
  const [loading, setLoading] = useState(false)

  const [nameEs, setNameEs] = useState('')
  const [nameCa, setNameCa] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [tpvName, setTpvName] = useState<string>('')

  const categoryOptions = useMemo(() => {
    const parents = categories
      .filter((c) => !c.parent_id)
      .slice()
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.name.localeCompare(b.name))

    const kidsByParent = new Map<string, CategoryRow[]>()
    for (const c of categories) {
      if (!c.parent_id) continue
      const list = kidsByParent.get(c.parent_id) ?? []
      list.push(c)
      kidsByParent.set(c.parent_id, list)
    }
    for (const [k, list] of kidsByParent) {
      kidsByParent.set(
        k,
        list.slice().sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.name.localeCompare(b.name))
      )
    }

    const out: Array<{ id: string; label: string }> = [{ id: '', label: 'Sin categoría' }]
    for (const p of parents) {
      out.push({ id: p.id, label: p.name })
      const kids = kidsByParent.get(p.id) ?? []
      for (const k of kids) {
        out.push({ id: k.id, label: `${p.name} · ${k.name}` })
      }
    }
    return out
  }, [categories])

  useEffect(() => {
    if (!open || articuloId == null) return
    setLoading(true)
    ;(async () => {
      try {
        const [mapRes, overrideRes] = await Promise.all([
          supabase
            .from('bdp_articulos')
            .select('id, nombre')
            .eq('id', articuloId)
            .maybeSingle(),
          supabase
            .from('digital_menu_overrides')
            .select('articulo_id, category_id, override_nombre_es, override_nombre_ca, override_nombre_en')
            .eq('articulo_id', articuloId)
            .maybeSingle(),
        ])
        if (mapRes.error) throw mapRes.error
        if (overrideRes.error) throw overrideRes.error
        setTpvName(mapRes.data?.nombre ?? `#${articuloId}`)
        setCategoryId(overrideRes.data?.category_id ?? '')
        setNameEs((overrideRes.data?.override_nombre_es ?? '').trim())
        setNameCa((overrideRes.data?.override_nombre_ca ?? '').trim())
        setNameEn((overrideRes.data?.override_nombre_en ?? '').trim())
      } catch (e: any) {
        toast.error(e?.message ?? 'No se pudo cargar el producto')
      } finally {
        setLoading(false)
      }
    })()
  }, [open, articuloId, supabase])

  if (!open || articuloId == null) return null

  return (
    <div
      className="fixed inset-0 z-[360] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={isPending ? undefined : onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Editar producto"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="relative flex min-h-[56px] items-center justify-center bg-[#36606F] px-12 py-3 text-white">
          <h2 className="line-clamp-2 text-center text-sm font-black uppercase tracking-wider">Editar producto</h2>
          <button
            type="button"
            className="absolute right-2 top-1/2 flex min-h-[48px] min-w-[48px] -translate-y-1/2 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/15 active:bg-white/10"
            onClick={isPending ? undefined : onClose}
            aria-label="Cerrar"
          >
            <X className="h-6 w-6" strokeWidth={2.5} />
          </button>
        </header>

        <div className="max-h-[75vh] overflow-y-auto p-4">
          <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
            <p className="text-[11px] font-black uppercase tracking-widest text-[#36606F]">TPV</p>
            <p className="mt-1 text-sm font-bold text-zinc-900">{tpvName}</p>
            <p className="mt-1 font-mono text-[11px] text-zinc-500">#{articuloId}</p>
          </div>

          {loading ? (
            <div className="mt-3 flex min-h-[120px] items-center justify-center rounded-xl border border-zinc-100 bg-white">
              <Loader2 className="h-5 w-5 animate-spin text-[#36606F]" />
            </div>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-1 gap-2">
                <label className="space-y-1">
                  <span className="text-[11px] font-black uppercase tracking-widest text-zinc-600">Nombre ES</span>
                  <input
                    value={nameEs}
                    onChange={(e) => setNameEs(e.target.value)}
                    className="min-h-[48px] w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-[#36606F]"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-black uppercase tracking-widest text-zinc-600">Nombre CA</span>
                  <input
                    value={nameCa}
                    onChange={(e) => setNameCa(e.target.value)}
                    className="min-h-[48px] w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-[#36606F]"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[11px] font-black uppercase tracking-widest text-zinc-600">Nombre EN</span>
                  <input
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                    className="min-h-[48px] w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-[#36606F]"
                  />
                </label>
              </div>

              <label className="mt-3 block space-y-1">
                <span className="text-[11px] font-black uppercase tracking-widest text-zinc-600">Categoría</span>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="min-h-[48px] w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-900 outline-none focus:border-[#36606F]"
                >
                  {categoryOptions.map((o) => (
                    <option key={o.id || '__none__'} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isPending}
                  className="min-h-[48px] rounded-xl border border-zinc-200 bg-white text-xs font-black uppercase tracking-widest text-zinc-700 active:bg-zinc-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    startTransition(async () => {
                      const res = await upsertMenuOverride({
                        articulo_id: articuloId,
                        override_nombre_es: nameEs.trim() || null,
                        override_nombre_ca: nameCa.trim() || null,
                        override_nombre_en: nameEn.trim() || null,
                        category_id: categoryId.trim() ? categoryId.trim() : null,
                      })
                      if (!res.success) {
                        toast.error(res.error ?? 'No se pudo guardar el producto')
                        return
                      }
                      toast.success('Producto guardado')
                      onClose()
                    })
                  }}
                  className="min-h-[48px] rounded-xl bg-[#36606F] text-xs font-black uppercase tracking-widest text-white active:bg-[#2c4f5c] disabled:opacity-60"
                >
                  {isPending ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Guardando…
                    </span>
                  ) : (
                    'Guardar'
                  )}
                </button>
              </div>

              <p className={cn('mt-3 text-[11px] font-semibold text-zinc-500')}>
                Nota: el cambio de categoría y nombres se aplica sin tocar el TPV.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

