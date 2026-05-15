'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Camera, Trash2, Upload, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import { upsertMenuOverride, type PlatoMarbellaSlotValue } from '@/app/dashboard/carta/actions'
import { PLATO_MARBELLA_CHILD_SLUG } from '@/lib/carta-plato-marbella'
import { tPlatoMarbellaUi, type CartaLang } from '@/lib/carta-menu-i18n'

type CategoryRow = {
  id: string
  name: string
  parent_id: string | null
  sort_order: number | null
  slug?: string | null
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
  const [recipePhotoUrl, setRecipePhotoUrl] = useState<string | null>(null)
  const [overridePhotoUrl, setOverridePhotoUrl] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null)
  const [removeOverridePhoto, setRemoveOverridePhoto] = useState(false)
  const [platoSlot, setPlatoSlot] = useState<'' | PlatoMarbellaSlotValue>('')
  const [platoMenuPrice, setPlatoMenuPrice] = useState(false)

  const platoMarbellaCategoryId = useMemo(
    () => categories.find((c) => c.slug === PLATO_MARBELLA_CHILD_SLUG)?.id ?? null,
    [categories]
  )
  const isPlatoMarbellaCategory = Boolean(
    platoMarbellaCategoryId && categoryId === platoMarbellaCategoryId
  )
  const platoUi = tPlatoMarbellaUi('es' satisfies CartaLang)

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
        const [mapRes, recipeRes, overrideRes] = await Promise.all([
          supabase
            .from('bdp_articulos')
            .select('id, nombre')
            .eq('id', articuloId)
            .maybeSingle(),
          supabase
            .from('map_tpv_receta')
            .select('articulo_id, recipes(photo_url)')
            .eq('articulo_id', articuloId)
            .maybeSingle(),
          supabase
            .from('digital_menu_overrides')
            .select(
              'articulo_id, category_id, override_nombre_es, override_nombre_ca, override_nombre_en, override_photo_url, plato_marbella_slot, plato_marbella_is_menu_price'
            )
            .eq('articulo_id', articuloId)
            .maybeSingle(),
        ])
        if (mapRes.error) throw mapRes.error
        if (recipeRes.error) throw recipeRes.error
        if (overrideRes.error) throw overrideRes.error
        setTpvName(mapRes.data?.nombre ?? `#${articuloId}`)
        setCategoryId(overrideRes.data?.category_id ?? '')
        setNameEs((overrideRes.data?.override_nombre_es ?? '').trim())
        setNameCa((overrideRes.data?.override_nombre_ca ?? '').trim())
        setNameEn((overrideRes.data?.override_nombre_en ?? '').trim())
        const rec0 = (recipeRes.data as any)?.recipes
        const rec = Array.isArray(rec0) ? rec0[0] : rec0
        setRecipePhotoUrl((rec?.photo_url ?? null) as string | null)
        const ov = (overrideRes.data as any)?.override_photo_url ?? null
        setOverridePhotoUrl(typeof ov === 'string' && ov.trim() ? ov.trim() : null)
        setSelectedFile(null)
        setRemoveOverridePhoto(false)
        const slot = (overrideRes.data as { plato_marbella_slot?: string | null } | null)
          ?.plato_marbella_slot
        setPlatoSlot(
          slot === 'entrante' || slot === 'principal' || slot === 'guarnicion' ? slot : ''
        )
        setPlatoMenuPrice(Boolean((overrideRes.data as { plato_marbella_is_menu_price?: boolean } | null)?.plato_marbella_is_menu_price))
        if (previewBlobUrl) {
          URL.revokeObjectURL(previewBlobUrl)
          setPreviewBlobUrl(null)
        }
      } catch (e: any) {
        toast.error(e?.message ?? 'No se pudo cargar el producto')
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, articuloId, supabase])

  useEffect(() => {
    return () => {
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl)
    }
  }, [previewBlobUrl])

  if (!open || articuloId == null) return null

  const displayPhotoSrc =
    previewBlobUrl ?? (removeOverridePhoto ? recipePhotoUrl : overridePhotoUrl ?? recipePhotoUrl)

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
              <div className="mt-3">
                <p className="text-[11px] font-black uppercase tracking-widest text-zinc-600">Imagen</p>
                <div className="mt-1 overflow-hidden rounded-xl border border-zinc-100 bg-zinc-50">
                  <div className="flex h-40 w-full items-center justify-center bg-white">
                    {displayPhotoSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element -- URL externa Supabase / blob
                      <img src={displayPhotoSrc} alt="" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <Camera className="h-10 w-10 text-zinc-200" aria-hidden />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-zinc-100 bg-zinc-50 p-2">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      id="menu-item-photo-upload"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null
                        if (!f) return
                        if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl)
                        const url = URL.createObjectURL(f)
                        setSelectedFile(f)
                        setPreviewBlobUrl(url)
                        setRemoveOverridePhoto(false)
                      }}
                      disabled={isPending}
                    />
                    <label
                      htmlFor="menu-item-photo-upload"
                      className={cn(
                        'inline-flex min-h-[48px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-[11px] font-black uppercase tracking-widest text-zinc-800 active:bg-zinc-50',
                        isPending && 'cursor-not-allowed opacity-60'
                      )}
                    >
                      <Upload className="h-4 w-4" strokeWidth={2.5} />
                      Cambiar
                    </label>
                    <button
                      type="button"
                      className={cn(
                        'inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-[11px] font-black uppercase tracking-widest text-zinc-800 active:bg-zinc-50',
                        isPending && 'opacity-60'
                      )}
                      onClick={() => {
                        if (previewBlobUrl) {
                          URL.revokeObjectURL(previewBlobUrl)
                          setPreviewBlobUrl(null)
                        }
                        setSelectedFile(null)
                        setRemoveOverridePhoto(true)
                        setOverridePhotoUrl(null)
                      }}
                      disabled={isPending}
                      aria-label="Usar foto de receta"
                      title="Usar foto de receta"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={2.5} />
                      Receta
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-[11px] font-semibold text-zinc-500">
                  Si no subes imagen, se usa la foto de la receta por defecto.
                </p>
              </div>

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
                  onChange={(e) => {
                    setCategoryId(e.target.value)
                    if (e.target.value !== platoMarbellaCategoryId) {
                      setPlatoSlot('')
                      setPlatoMenuPrice(false)
                    }
                  }}
                  className="min-h-[48px] w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-900 outline-none focus:border-[#36606F]"
                >
                  {categoryOptions.map((o) => (
                    <option key={o.id || '__none__'} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              {isPlatoMarbellaCategory ? (
                <div className="mt-3 space-y-3 rounded-xl border border-[#36606F]/20 bg-[#36606F]/5 p-3">
                  <label className="block space-y-1">
                    <span className="text-[11px] font-black uppercase tracking-widest text-[#36606F]">
                      {platoUi.editorSlotLabel}
                    </span>
                    <select
                      value={platoSlot}
                      disabled={platoMenuPrice}
                      onChange={(e) =>
                        setPlatoSlot((e.target.value || '') as '' | PlatoMarbellaSlotValue)
                      }
                      className="min-h-[48px] w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-900 outline-none focus:border-[#36606F] disabled:opacity-50"
                    >
                      <option value="">{platoUi.editorSlotNone}</option>
                      <option value="entrante">{platoUi.editorSlotEntrante}</option>
                      <option value="principal">{platoUi.editorSlotPrincipal}</option>
                      <option value="guarnicion">{platoUi.editorSlotGuarnicion}</option>
                    </select>
                  </label>
                  <label className="flex min-h-[48px] cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={platoMenuPrice}
                      onChange={(e) => {
                        const on = e.target.checked
                        setPlatoMenuPrice(on)
                        if (on) setPlatoSlot('')
                      }}
                      className="h-5 w-5 shrink-0 rounded border-zinc-300"
                    />
                    <span className="text-sm font-bold text-zinc-900">{platoUi.editorMenuPrice}</span>
                  </label>
                  <p className="text-[11px] font-semibold text-zinc-600">{platoUi.editorMenuPriceHint}</p>
                </div>
              ) : null}

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
                      let nextOverridePhotoUrl: string | null | undefined = undefined

                      try {
                        if (selectedFile) {
                          const fileExt = selectedFile.name.split('.').pop()
                          const cleanBase = selectedFile.name
                            .toLowerCase()
                            .replace(/\.[^/.]+$/, '')
                            .normalize('NFD')
                            .replace(/[\u0300-\u036f]/g, '')
                            .replace(/[^a-z0-9]/g, '_')
                          const fileName = `${Date.now()}-${cleanBase || 'carta'}.${fileExt}`
                          const filePath = `menu-items/${articuloId}/${fileName}`

                          const up = await supabase.storage.from('carta_items').upload(filePath, selectedFile, { upsert: true })
                          if (up.error) throw up.error
                          const { data } = supabase.storage.from('carta_items').getPublicUrl(filePath)
                          const pub = data?.publicUrl
                          if (!pub) throw new Error('No se pudo obtener la URL pública de la imagen.')
                          nextOverridePhotoUrl = pub
                        } else if (removeOverridePhoto) {
                          nextOverridePhotoUrl = null
                        }
                      } catch (e: any) {
                        const msg = String(e?.message ?? '')
                        if (
                          msg.toLowerCase().includes('bucket') &&
                          (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('does not exist'))
                        ) {
                          toast.error(
                            "No existe el bucket 'carta_items' en Storage. Ejecuta las migraciones de Supabase o crea el bucket manualmente."
                          )
                        } else {
                          toast.error(e?.message ?? 'No se pudo subir la imagen')
                        }
                        return
                      }

                      const res = await upsertMenuOverride({
                        articulo_id: articuloId,
                        override_nombre_es: nameEs.trim() || null,
                        override_nombre_ca: nameCa.trim() || null,
                        override_nombre_en: nameEn.trim() || null,
                        category_id: categoryId.trim() ? categoryId.trim() : null,
                        ...(nextOverridePhotoUrl !== undefined ? { override_photo_url: nextOverridePhotoUrl } : {}),
                        ...(isPlatoMarbellaCategory
                          ? {
                              plato_marbella_slot: platoMenuPrice ? null : platoSlot || null,
                              plato_marbella_is_menu_price: platoMenuPrice,
                            }
                          : {
                              plato_marbella_slot: null,
                              plato_marbella_is_menu_price: false,
                            }),
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

