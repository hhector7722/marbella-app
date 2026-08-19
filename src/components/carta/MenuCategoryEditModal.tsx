'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Loader2, Search, Upload, Camera } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import { Modal } from '@/components/ui/modal'
import {
  setMenuCategoryCover,
  upsertMenuCategoryOverride,
} from '@/app/dashboard/carta/actions'
import { uploadNormalizedCategoryCoverPhoto } from '@/app/dashboard/carta/photo-actions'
import {
  type CartaPhotoScale,
  normalizeCartaPhotoScale,
} from '@/lib/carta-product-photo'
import { CartaMenuCoverPhoto } from '@/components/carta/CartaMenuCoverPhoto'

type MenuItemOption = {
  articulo_id: number
  articulo_nombre: string
}

export type MenuCategoryEditModalCategory = {
  id: string
  name: string
  parent_id: string | null
  cover_articulo_id: number | null
  cover_photo_url?: string | null
  cover_photo_scale?: string | null
}

export function MenuCategoryEditModal({
  open,
  onClose,
  category,
  itemsForCover,
}: {
  open: boolean
  onClose: () => void
  category: MenuCategoryEditModalCategory | null
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
  /** none | product | custom */
  const [portadaOrigen, setPortadaOrigen] = useState<'none' | 'product' | 'custom'>('none')
  const [coverPhotoUrl, setCoverPhotoUrl] = useState<string | null>(null)
  const [coverPhotoScale, setCoverPhotoScale] = useState<CartaPhotoScale>('m')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null)

  const isParent = category?.parent_id == null

  useEffect(() => {
    if (!open || !category) return
    setCoverQuery('')
    const custom = Boolean(category.cover_photo_url?.trim())
    setPortadaOrigen(custom ? 'custom' : category.cover_articulo_id != null ? 'product' : 'none')
    setCoverArticuloId(category.cover_articulo_id ?? null)
    setCoverPhotoUrl(category.cover_photo_url?.trim() || null)
    setCoverPhotoScale(normalizeCartaPhotoScale(category.cover_photo_scale))
    setUploadFile(null)
    if (uploadPreviewUrl) {
      URL.revokeObjectURL(uploadPreviewUrl)
      setUploadPreviewUrl(null)
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category, supabase])

  useEffect(() => {
    return () => {
      if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl)
    }
  }, [uploadPreviewUrl])

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

  const previewCoverSrc = uploadPreviewUrl ?? coverPhotoUrl?.trim() ?? null

  if (!category) return null

  return (
    <Modal
      open={open}
      onClose={isPending ? () => {} : onClose}
      title="Editar categoría"
      variant="standard"
      layer="base"
      instance="carta-category-edit"
      headerTone="petroleum"
      loading={isPending}
      closeOnBackdrop={!isPending}
    >
        <div className="p-4">
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
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'none' as const, label: 'Sin' },
                        { id: 'product' as const, label: 'Producto' },
                        { id: 'custom' as const, label: 'Archivo' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          setPortadaOrigen(opt.id)
                          if (opt.id === 'product') {
                            if (uploadPreviewUrl) {
                              URL.revokeObjectURL(uploadPreviewUrl)
                              setUploadPreviewUrl(null)
                            }
                            setUploadFile(null)
                            setCoverArticuloId(category.cover_articulo_id ?? null)
                            setCoverPhotoUrl(category.cover_photo_url?.trim() || null)
                          }
                          if (opt.id === 'custom') {
                            setCoverArticuloId(null)
                            setCoverPhotoUrl(category.cover_photo_url?.trim() || null)
                            setCoverPhotoScale(normalizeCartaPhotoScale(category.cover_photo_scale))
                          }
                          if (opt.id === 'none') {
                            if (uploadPreviewUrl) {
                              URL.revokeObjectURL(uploadPreviewUrl)
                              setUploadPreviewUrl(null)
                            }
                            setUploadFile(null)
                            setCoverArticuloId(null)
                            setCoverPhotoUrl(null)
                          }
                        }}
                        className={cn(
                          'min-h-[48px] rounded-xl border text-[10px] font-black uppercase tracking-widest sm:text-[11px]',
                          portadaOrigen === opt.id
                            ? 'border-[#36606F] bg-[#36606F] text-white'
                            : 'border-zinc-200 bg-white text-zinc-800 active:bg-zinc-50'
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {portadaOrigen === 'product' ? (
                    <>
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
                        {coverOptions.map((it) => (
                          <button
                            key={it.articulo_id}
                            type="button"
                            onClick={() => setCoverArticuloId(it.articulo_id)}
                            className={cn(
                              'flex min-h-[48px] w-full items-center justify-between gap-3 px-3 text-left',
                              coverArticuloId === it.articulo_id
                                ? 'bg-[#36606F]/10 text-[#36606F]'
                                : 'text-zinc-900 active:bg-zinc-50'
                            )}
                          >
                            <span className="min-w-0 flex-1 truncate text-xs font-bold">{it.articulo_nombre}</span>
                            <span className="shrink-0 font-mono text-[11px] text-zinc-500">#{it.articulo_id}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}

                  {portadaOrigen === 'custom' ? (
                    <div className="space-y-2 rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                      <p className="text-[11px] font-semibold text-zinc-600">
                        Sube una imagen (se normaliza como el resto de la carta). Se guarda al pulsar Guardar.
                      </p>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        id="category-cover-upload"
                        disabled={isPending}
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null
                          if (!f) return
                          if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl)
                          const url = URL.createObjectURL(f)
                          setUploadFile(f)
                          setUploadPreviewUrl(url)
                        }}
                      />
                      <label
                        htmlFor="category-cover-upload"
                        className={cn(
                          'flex min-h-[48px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white text-xs font-black uppercase tracking-widest text-zinc-800 active:bg-zinc-50',
                          isPending && 'pointer-events-none opacity-60'
                        )}
                      >
                        <Upload className="h-4 w-4" strokeWidth={2.5} />
                        Elegir archivo
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {(['s', 'm', 'l'] as const).map((size) => (
                          <button
                            key={size}
                            type="button"
                            disabled={isPending}
                            onClick={() => setCoverPhotoScale(size)}
                            className={cn(
                              'min-h-[48px] flex-1 rounded-xl border text-xs font-black uppercase tracking-widest',
                              coverPhotoScale === size
                                ? 'border-[#36606F] bg-[#36606F] text-white'
                                : 'border-zinc-200 bg-white text-zinc-800 active:bg-zinc-50'
                            )}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                      <div className="mx-auto flex aspect-[5/4] w-[min(72%,9rem)] items-center justify-center overflow-hidden rounded-xl border border-zinc-100 bg-white">
                        {previewCoverSrc ? (
                          <CartaMenuCoverPhoto src={previewCoverSrc} scale={coverPhotoScale} className="p-1" />
                        ) : (
                          <Camera className="h-10 w-10 text-zinc-200" aria-hidden />
                        )}
                      </div>
                    </div>
                  ) : null}
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

                        let nextPhotoUrl: string | null = null
                        let nextArticulo: number | null = null
                        let nextScale: CartaPhotoScale | null = null

                        if (portadaOrigen === 'none') {
                          nextPhotoUrl = null
                          nextArticulo = null
                          nextScale = null
                        } else if (portadaOrigen === 'product') {
                          if (coverArticuloId == null) {
                            toast.error('Elige un artículo de la lista.')
                            return
                          }
                          nextPhotoUrl = null
                          nextArticulo = coverArticuloId
                          nextScale = null
                        } else {
                          nextArticulo = null
                          nextScale = coverPhotoScale
                          if (uploadFile) {
                            const fd = new FormData()
                            fd.append('file', uploadFile)
                            fd.append('category_id', category.id)
                            const up = await uploadNormalizedCategoryCoverPhoto(fd)
                            if (!up.success) {
                              toast.error(up.error)
                              return
                            }
                            nextPhotoUrl = up.publicUrl
                          } else if (coverPhotoUrl?.trim()) {
                            nextPhotoUrl = coverPhotoUrl.trim()
                          } else {
                            toast.error('Elige una imagen o cambia a producto / sin portada.')
                            return
                          }
                        }

                        const resCover = await setMenuCategoryCover({
                          category_id: category.id,
                          cover_articulo_id: nextArticulo,
                          cover_photo_url: nextPhotoUrl,
                          cover_photo_scale: nextScale,
                        })
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
    </Modal>
  )
}
