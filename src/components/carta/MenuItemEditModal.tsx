'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Camera, Trash2, Upload, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { createClient } from '@/utils/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/Field'
import { upsertMenuOverride, type PlatoMarbellaSlotValue } from '@/app/dashboard/carta/actions'
import { uploadNormalizedCartaItemPhoto } from '@/app/dashboard/carta/photo-actions'
import { PLATO_MARBELLA_CHILD_SLUG } from '@/lib/carta-plato-marbella'
import { isCartaDualRacionParentCategory } from '@/lib/carta-dual-racion'
import { tPublicUi } from '@/lib/carta-menu-i18n'
import { tPlatoMarbellaUi, type CartaLang } from '@/lib/carta-menu-i18n'
import { CartaMenuProductPhoto } from '@/components/carta/CartaMenuProductPhoto'
import {
  CARTA_PRODUCT_PHOTO_FRAME_SHELL_CLASS,
  type CartaPhotoScale,
  getCartaProductPhotoFrameStyle,
  getCartaProductPhotoScaleFactor,
  isCartaDrinksSection,
  normalizeCartaPhotoScale,
} from '@/lib/carta-product-photo'

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
  onSaved,
  articuloId,
  categories,
}: {
  open: boolean
  onClose: () => void
  /** Actualiza la fila en el grid staff sin esperar recarga completa. */
  onSaved?: (patch: { articulo_id: number; carta_photo_scale: CartaPhotoScale }) => void
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
  const [platoHideName, setPlatoHideName] = useState(false)
  const [photoScale, setPhotoScale] = useState<CartaPhotoScale>('m')
  const [dualRacionEnabled, setDualRacionEnabled] = useState(false)
  const [precioEntero, setPrecioEntero] = useState('')
  const [precioMedio, setPrecioMedio] = useState('')
  const [labelEnteroEs, setLabelEnteroEs] = useState('')
  const [labelEnteroCa, setLabelEnteroCa] = useState('')
  const [labelEnteroEn, setLabelEnteroEn] = useState('')
  const [labelMedioEs, setLabelMedioEs] = useState('')
  const [labelMedioCa, setLabelMedioCa] = useState('')
  const [labelMedioEn, setLabelMedioEn] = useState('')
  const [tpvPrecioBase, setTpvPrecioBase] = useState<string | null>(null)

  const platoMarbellaCategoryId = useMemo(
    () => categories.find((c) => c.slug === PLATO_MARBELLA_CHILD_SLUG)?.id ?? null,
    [categories]
  )
  const isPlatoMarbellaCategory = Boolean(
    (platoMarbellaCategoryId && categoryId === platoMarbellaCategoryId) ||
      platoSlot ||
      platoMenuPrice
  )
  const platoUi = tPlatoMarbellaUi('es' satisfies CartaLang)
  const dualUi = tPublicUi('es')

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
        const [mapRes, recipeRes, overrideResWithScale, overrideResBase] = await Promise.all([
          supabase
            .from('bdp_articulos')
            .select('id, nombre, precio_base')
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
              'articulo_id, category_id, override_nombre_es, override_nombre_ca, override_nombre_en, override_photo_url, carta_photo_scale, plato_marbella_slot, plato_marbella_is_menu_price, override_precio, override_precio_medio, carta_dual_racion_enabled, carta_racion_entero_es, carta_racion_entero_ca, carta_racion_entero_en, carta_racion_medio_es, carta_racion_medio_ca, carta_racion_medio_en'
            )
            .eq('articulo_id', articuloId)
            .maybeSingle(),
          supabase
            .from('digital_menu_overrides')
            .select(
              'articulo_id, category_id, override_nombre_es, override_nombre_ca, override_nombre_en, override_photo_url, plato_marbella_slot, plato_marbella_is_menu_price, override_precio, override_precio_medio, carta_dual_racion_enabled, carta_racion_entero_es, carta_racion_entero_ca, carta_racion_entero_en, carta_racion_medio_es, carta_racion_medio_ca, carta_racion_medio_en'
            )
            .eq('articulo_id', articuloId)
            .maybeSingle(),
        ])
        const overrideRes =
          overrideResWithScale.error?.message?.includes('carta_photo_scale') &&
          !overrideResBase.error
            ? overrideResBase
            : overrideResWithScale
        if (mapRes.error) throw mapRes.error
        if (recipeRes.error) throw recipeRes.error
        if (overrideRes.error) throw overrideRes.error
        setTpvName(mapRes.data?.nombre ?? `#${articuloId}`)
        const pb = mapRes.data?.precio_base
        setTpvPrecioBase(pb != null && String(pb).trim() !== '' ? String(pb) : null)
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
        setPlatoHideName(Boolean((overrideRes.data as { plato_marbella_hide_name?: boolean } | null)?.plato_marbella_hide_name))
        setPhotoScale(
          normalizeCartaPhotoScale(
            (overrideRes.data as { carta_photo_scale?: string | null } | null)?.carta_photo_scale
          )
        )
        const ovData = overrideRes.data as Record<string, unknown> | null
        setDualRacionEnabled(Boolean(ovData?.carta_dual_racion_enabled))
        const op = ovData?.override_precio
        setPrecioEntero(
          op != null && String(op).trim() !== ''
            ? String(op)
            : pb != null && String(pb).trim() !== ''
              ? String(pb)
              : ''
        )
        const opm = ovData?.override_precio_medio
        setPrecioMedio(opm != null && String(opm).trim() !== '' ? String(opm) : '')
        setLabelEnteroEs(String(ovData?.carta_racion_entero_es ?? '').trim())
        setLabelEnteroCa(String(ovData?.carta_racion_entero_ca ?? '').trim())
        setLabelEnteroEn(String(ovData?.carta_racion_entero_en ?? '').trim())
        setLabelMedioEs(String(ovData?.carta_racion_medio_es ?? '').trim())
        setLabelMedioCa(String(ovData?.carta_racion_medio_ca ?? '').trim())
        setLabelMedioEn(String(ovData?.carta_racion_medio_en ?? '').trim())
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

  const previewParentName = useMemo(() => {
    if (!categoryId) return null
    const cat = categories.find((c) => c.id === categoryId)
    if (!cat) return null
    if (!cat.parent_id) return cat.name
    return categories.find((c) => c.id === cat.parent_id)?.name ?? null
  }, [categoryId, categories])

  const isDualRacionCategory = isCartaDualRacionParentCategory(previewParentName)

  if (articuloId == null) return null

  const displayPhotoSrc =
    previewBlobUrl ?? (removeOverridePhoto ? recipePhotoUrl : overridePhotoUrl ?? recipePhotoUrl)

  const previewIsDrink = isCartaDrinksSection(previewParentName)
  const previewLayoutFactor = getCartaProductPhotoScaleFactor(
    photoScale,
    previewIsDrink,
    articuloId
  )
  const previewFrameStyle = getCartaProductPhotoFrameStyle(previewIsDrink, previewLayoutFactor)
  const hasPhoto = Boolean(displayPhotoSrc?.trim())

  return (
    <Modal
      open={open}
      onClose={isPending ? () => {} : onClose}
      title="Editar producto"
      variant="standard"
      layer="base"
      instance="carta-item-edit"
      headerTone="petroleum"
      loading={isPending}
      closeOnBackdrop={!isPending}
    >
        <div>
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
                      accept="image/jpeg,image/png,image/webp"
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
                  Si no subes imagen, se usa la foto de la receta. Al subir, el producto se guarda entero (sin
                  recortar). Vuelve a subir si una foto se ve cortada.
                </p>
              </div>

              {hasPhoto ? (
                <div className="mt-3">
                  <p className="text-[11px] font-black uppercase tracking-widest text-zinc-600">
                    Tamaño en carta
                  </p>
                  <div className="mt-1 flex gap-2">
                    {(['s', 'm', 'l'] as const).map((size) => (
                      <button
                        key={size}
                        type="button"
                        disabled={isPending}
                        onClick={() => setPhotoScale(size)}
                        className={cn(
                          'min-h-[48px] flex-1 rounded-xl border text-xs font-black uppercase tracking-widest',
                          photoScale === size
                            ? 'border-[#36606F] bg-[#36606F] text-white'
                            : 'border-zinc-200 bg-white text-zinc-800 active:bg-zinc-50'
                        )}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-center">
                    <div
                      className={cn(
                        CARTA_PRODUCT_PHOTO_FRAME_SHELL_CLASS,
                        'w-[min(42vw,7.5rem)] border border-zinc-100'
                      )}
                      style={previewFrameStyle}
                      aria-live="polite"
                    >
                      <CartaMenuProductPhoto
                        src={displayPhotoSrc!}
                        scale={photoScale}
                        isDrink={previewIsDrink}
                        articuloId={articuloId}
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] font-semibold text-zinc-500">
                    S reduce productos que se ven grandes (ej. olivas); L amplía platos que se ven pequeños.
                  </p>
                </div>
              ) : null}

              <div className="mt-3 grid grid-cols-1 gap-2">
                <Field instance="menu-item-name-es" label="Nombre ES" htmlFor="menu-item-name-es">
                  <input id="menu-item-name-es" value={nameEs} onChange={(e) => setNameEs(e.target.value)} />
                </Field>
                <Field instance="menu-item-name-ca" label="Nombre CA" htmlFor="menu-item-name-ca">
                  <input id="menu-item-name-ca" value={nameCa} onChange={(e) => setNameCa(e.target.value)} />
                </Field>
                <Field instance="menu-item-name-en" label="Nombre EN" htmlFor="menu-item-name-en">
                  <input id="menu-item-name-en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
                </Field>
              </div>

              <Field instance="menu-item-category" label="Categoría" htmlFor="menu-item-category">
                <select
                  id="menu-item-category"
                  value={categoryId}
                  onChange={(e) => {
                    setCategoryId(e.target.value)
                    if (e.target.value !== platoMarbellaCategoryId) {
                      setPlatoSlot('')
                      setPlatoMenuPrice(false)
                    }
                  }}
                >
                  {categoryOptions.map((o) => (
                    <option key={o.id || '__none__'} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>

              {isDualRacionCategory ? (
                <div className="mt-3 space-y-3 rounded-xl border border-[#36606F]/20 bg-[#36606F]/5 p-3">
                  <label className="flex min-h-[48px] cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={dualRacionEnabled}
                      onChange={(e) => setDualRacionEnabled(e.target.checked)}
                      className="h-5 w-5 shrink-0 rounded border-zinc-300"
                    />
                    <span className="text-sm font-bold text-zinc-900">
                      Mostrar precio entero y medio en carta
                    </span>
                  </label>
                  {dualRacionEnabled ? (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <Field instance="menu-item-precio-entero" label={`Precio ${dualUi.racionEntero}`} htmlFor="menu-item-precio-entero">
                          <input
                            id="menu-item-precio-entero"
                            type="text"
                            inputMode="decimal"
                            value={precioEntero}
                            onChange={(e) => setPrecioEntero(e.target.value)}
                            placeholder={tpvPrecioBase ?? '0.00'}
                          />
                        </Field>
                        <Field instance="menu-item-precio-medio" label={`Precio ${dualUi.racionMedio}`} htmlFor="menu-item-precio-medio">
                          <input
                            id="menu-item-precio-medio"
                            type="text"
                            inputMode="decimal"
                            value={precioMedio}
                            onChange={(e) => setPrecioMedio(e.target.value)}
                            placeholder="0.00"
                          />
                        </Field>
                      </div>
                      <p className="text-[11px] font-semibold text-zinc-600">
                        Etiquetas en carta (vacío = texto por defecto del idioma).
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            ['ES', labelEnteroEs, setLabelEnteroEs, labelMedioEs, setLabelMedioEs],
                            ['CA', labelEnteroCa, setLabelEnteroCa, labelMedioCa, setLabelMedioCa],
                            ['EN', labelEnteroEn, setLabelEnteroEn, labelMedioEn, setLabelMedioEn],
                          ] as const
                        ).map(([langCode, enteroVal, setEntero, medioVal, setMedio]) => (
                          <div key={langCode} className="space-y-1.5 rounded-lg border border-zinc-100 bg-white p-2">
                            <p className="text-center text-[10px] font-black uppercase text-zinc-500">{langCode}</p>
                            <input
                              type="text"
                              value={enteroVal}
                              onChange={(e) => setEntero(e.target.value)}
                              placeholder={dualUi.racionEntero}
                              maxLength={32}
                              className="min-h-[40px] w-full rounded-lg border border-zinc-200 px-2 text-xs font-bold"
                              aria-label={`${dualUi.racionEntero} ${langCode}`}
                            />
                            <input
                              type="text"
                              value={medioVal}
                              onChange={(e) => setMedio(e.target.value)}
                              placeholder={dualUi.racionMedio}
                              maxLength={32}
                              className="min-h-[40px] w-full rounded-lg border border-zinc-200 px-2 text-xs font-bold"
                              aria-label={`${dualUi.racionMedio} ${langCode}`}
                            />
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}

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
                  <label className="flex min-h-[48px] cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={platoHideName}
                      onChange={(e) => setPlatoHideName(e.target.checked)}
                      className="h-5 w-5 shrink-0 rounded border-zinc-300"
                    />
                    <span className="text-sm font-bold text-zinc-900">{platoUi.editorHideName}</span>
                  </label>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  instance="menu-item-edit-cancel"
                  onClick={onClose}
                  disabled={isPending}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  instance="menu-item-edit-save"
                  disabled={isPending}
                  loading={isPending}
                  onClick={() => {
                    startTransition(async () => {
                      let nextOverridePhotoUrl: string | null | undefined = undefined

                      try {
                        if (selectedFile) {
                          const fd = new FormData()
                          fd.append('file', selectedFile)
                          fd.append('articulo_id', String(articuloId))
                          const up = await uploadNormalizedCartaItemPhoto(fd)
                          if (!up.success) throw new Error(up.error)
                          nextOverridePhotoUrl = up.publicUrl
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

                      const parsePriceInput = (raw: string): number | null => {
                        const t = raw.trim().replace(',', '.')
                        if (!t) return null
                        const n = Number(t)
                        return Number.isFinite(n) && n >= 0 ? n : null
                      }

                      let dualPayload: Record<string, unknown> = {
                        carta_dual_racion_enabled: false,
                        override_precio_medio: null,
                        carta_racion_entero_es: null,
                        carta_racion_entero_ca: null,
                        carta_racion_entero_en: null,
                        carta_racion_medio_es: null,
                        carta_racion_medio_ca: null,
                        carta_racion_medio_en: null,
                      }
                      if (isDualRacionCategory && dualRacionEnabled) {
                        const pEntero = parsePriceInput(precioEntero)
                        const pMedio = parsePriceInput(precioMedio)
                        if (pEntero == null || pEntero <= 0 || pMedio == null || pMedio <= 0) {
                          toast.error('Indica precio entero y medio mayores que 0')
                          return
                        }
                        dualPayload = {
                          carta_dual_racion_enabled: true,
                          override_precio: pEntero,
                          override_precio_medio: pMedio,
                          carta_racion_entero_es: labelEnteroEs.trim() || null,
                          carta_racion_entero_ca: labelEnteroCa.trim() || null,
                          carta_racion_entero_en: labelEnteroEn.trim() || null,
                          carta_racion_medio_es: labelMedioEs.trim() || null,
                          carta_racion_medio_ca: labelMedioCa.trim() || null,
                          carta_racion_medio_en: labelMedioEn.trim() || null,
                        }
                      }

                      if (isPlatoMarbellaCategory && !platoMenuPrice && !platoSlot) {
                        toast.error(
                          'En Plat Marbella, elige un tramo (entrante, principal o guarnición) o marca «Precio del menú».'
                        )
                        return
                      }

                      const res = await upsertMenuOverride({
                        articulo_id: articuloId,
                        override_nombre_es: nameEs.trim() || null,
                        override_nombre_ca: nameCa.trim() || null,
                        override_nombre_en: nameEn.trim() || null,
                        category_id: categoryId.trim() ? categoryId.trim() : null,
                        carta_photo_scale: photoScale,
                        ...(nextOverridePhotoUrl !== undefined ? { override_photo_url: nextOverridePhotoUrl } : {}),
                        ...(isPlatoMarbellaCategory
                          ? {
                              plato_marbella_slot: platoMenuPrice ? null : platoSlot || null,
                              plato_marbella_is_menu_price: platoMenuPrice,
                              plato_marbella_hide_name: platoHideName,
                            }
                          : {
                              plato_marbella_slot: null,
                              plato_marbella_is_menu_price: false,
                              plato_marbella_hide_name: false,
                            }),
                        ...dualPayload,
                      })
                      if (!res.success) {
                        toast.error(res.error ?? 'No se pudo guardar el producto')
                        return
                      }
                      if (res.carta_photo_scale_persisted === false) {
                        toast.warning(
                          'Guardado sin talla de foto: ejecuta la migración 20260515170000_carta_photo_scale en Supabase.'
                        )
                      }
                      onSaved?.({ articulo_id: articuloId, carta_photo_scale: photoScale })
                      toast.success('Producto guardado')
                      onClose()
                    })
                  }}
                >
                  Guardar
                </Button>
              </div>

              <p className={cn('mt-3 text-[11px] font-semibold text-zinc-500')}>
                Nota: el cambio de categoría y nombres se aplica sin tocar el TPV.
              </p>
            </>
          )}
        </div>
    </Modal>
  )
}

