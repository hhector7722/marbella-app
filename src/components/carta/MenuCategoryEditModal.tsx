'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { X, Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import {
  setMenuSectionCoverArticulo,
  upsertMenuCategoryOverride,
} from '@/app/dashboard/carta/actions'

type MenuItemOption = {
  articulo_id: number
  articulo_nombre: string
}

export function MenuCategoryEditModal({
  open,
  onClose,
  category,
  itemsForCover,
}: {
  open: boolean
  onClose: () => void
  category: {
    id: string
    name: string
    parent_id: string | null
    cover_articulo_id: number | null
  } | null
  itemsForCover: MenuItemOption[]
}) {
  const supabase = useMemo(() => createClient(), [])
  const [isPending, startTransition] = useTransition()

  const [loading, setLoading] = useState(false)
  const [nameEs, setNameEs] = useState('')
  const [nameCa, setNameCa] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [coverQuery, setCoverQuery] = useState('')
  const [coverArticuloId, setCoverArticuloId] = useState<number | null>(null)

  const isParent = category?.parent_id == null

  useEffect(() => {
    if (!open || !category) return
    setCoverQuery('')
    setCoverArticuloId(category.cover_articulo_id ?? null)
    setLoading(true)
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('menu_category_overrides')
          .select('override_name_es, override_name_ca, override_name_en')
          .eq('category_id', category.id)
          .maybeSingle()
        if (error) throw error
        setNameEs((data?.override_name_es ?? '').trim())
        setNameCa((data?.override_name_ca ?? '').trim())
        setNameEn((data?.override_name_en ?? '').trim())
      } catch (e: any) {
        toast.error(e?.message ?? 'No se pudo cargar la categoría')
      } finally {
        setLoading(false)
      }
    })()
  }, [open, category, supabase])

  const coverOptions = useMemo(() => {
    const q = coverQuery.trim().toLowerCase()
    const list = itemsForCover
      .slice()
      .sort((a, b) => a.articulo_nombre.localeCompare(b.articulo_nombre, 'es', { sensitivity: 'base' }))
    if (!q) return list.slice(0, 40)
    return list
      .filter((it) => it.articulo_nombre.toLowerCase().includes(q) || String(it.articulo_id).includes(q))
      .slice(0, 40)
  }, [itemsForCover, coverQuery])

  if (!open || !category) return null

  return (
    <div
      className="fixed inset-0 z-[350] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={isPending ? undefined : onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Editar categoría"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="relative flex min-h-[56px] items-center justify-center bg-[#36606F] px-12 py-3 text-white">
          <h2 className="line-clamp-2 text-center text-sm font-black uppercase tracking-wider">
            Editar categoría
          </h2>
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
          <div className="space-y-3">
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
              <p className="text-[11px] font-black uppercase tracking-widest text-[#36606F]">Actual</p>
              <p className="mt-1 text-sm font-bold text-zinc-900">{category.name}</p>
            </div>

            {loading ? (
              <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-zinc-100 bg-white">
                <Loader2 className="h-5 w-5 animate-spin text-[#36606F]" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-2">
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

                <div className="space-y-2">
                  <p className="text-[11px] font-black uppercase tracking-widest text-zinc-600">
                    {isParent ? 'Portada sección' : 'Portada subcategoría'}
                  </p>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <input
                      value={coverQuery}
                      onChange={(e) => setCoverQuery(e.target.value)}
                      placeholder="Buscar artículo…"
                      className="min-h-[48px] w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-3 text-sm font-semibold text-zinc-900 outline-none focus:border-[#36606F] disabled:bg-zinc-50"
                    />
                  </div>
                  <div className="max-h-56 overflow-y-auto rounded-xl border border-zinc-100 bg-white">
                    <button
                      type="button"
                      onClick={() => setCoverArticuloId(null)}
                      className={cn(
                        'flex min-h-[48px] w-full items-center justify-between gap-3 px-3 text-left text-xs font-black uppercase tracking-wide',
                        coverArticuloId == null ? 'bg-[#36606F]/10 text-[#36606F]' : 'text-zinc-700 active:bg-zinc-50'
                      )}
                    >
                      Sin portada
                      <span className="font-mono text-[11px] text-zinc-500">null</span>
                    </button>
                    {coverOptions.map((it) => (
                      <button
                        key={it.articulo_id}
                        type="button"
                        onClick={() => setCoverArticuloId(it.articulo_id)}
                        className={cn(
                          'flex min-h-[48px] w-full items-center justify-between gap-3 px-3 text-left',
                          coverArticuloId === it.articulo_id ? 'bg-[#36606F]/10 text-[#36606F]' : 'text-zinc-900 active:bg-zinc-50'
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate text-xs font-bold">{it.articulo_nombre}</span>
                        <span className="shrink-0 font-mono text-[11px] text-zinc-500">#{it.articulo_id}</span>
                      </button>
                    ))}
                  </div>
                </div>

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
                        const res = await upsertMenuCategoryOverride({
                          category_id: category.id,
                          override_name_es: nameEs.trim() || null,
                          override_name_ca: nameCa.trim() || null,
                          override_name_en: nameEn.trim() || null,
                        })
                        if (!res.success) {
                          toast.error(res.error ?? 'No se pudo guardar la categoría')
                          return
                        }

                        const resCover = await setMenuSectionCoverArticulo(category.id, coverArticuloId)
                        if (!resCover.success) {
                          toast.error(resCover.error ?? 'No se pudo guardar la portada')
                          return
                        }

                        toast.success('Categoría guardada')
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
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

