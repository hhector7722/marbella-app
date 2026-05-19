'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { ChevronLeft, Pencil, X } from 'lucide-react'
import { CartaImageLightbox } from '@/components/carta/CartaImageLightbox'
import { CartaCategoryCard, CartaCategoryGrid } from '@/components/carta/CartaCategoryGrid'
import { CartaLangPicker } from '@/components/carta/CartaLangPicker'
import {
  type CartaLang,
  DEFAULT_CARTA_LANG,
  getCartaChildCategoryLabel,
  getCartaDisplayName,
  getCartaParentCategoryLabel,
  getCartaSubcategoryPickerLabel,
  tPublicUi,
} from '@/lib/carta-menu-i18n'
import { CartaSubcategoryPickerButton } from '@/components/carta/CartaSubcategoryPickerButton'
import { CartaDualRacionPrices } from '@/components/carta/CartaDualRacionPrices'
import { resolveCartaDualRacionLabels } from '@/lib/carta-dual-racion'
import { mergeEnteroMedioForCartaDisplay } from '@/lib/carta-medio-merge'
import { CartaMenuProductPhoto } from '@/components/carta/CartaMenuProductPhoto'
import {
  CARTA_PRODUCT_PHOTO_FRAME_SHELL_CLASS,
  type CartaPhotoScale,
  cartaProductGridRowDensity,
  cartaShowsProductPhoto,
  chunkCartaProductGridRows,
  getCartaProductGridRowFrameStyle,
  isCartaDrinksSection,
} from '@/lib/carta-product-photo'
import { PlatoMarbellaMenuView } from '@/components/carta/PlatoMarbellaMenuView'
import {
  PlatoMarbellaModalScheduleFooter,
  PlatoMarbellaModalSubheader,
} from '@/components/carta/PlatoMarbellaModalChrome'
import {
  bucketMenuRowForPlatoMarbella,
  groupPlatoMarbellaItems,
  isPlatoMarbellaMenuSub,
  platoMarbellaCategoryIdFromCatalog,
  type MenuCategoryCatalogEntry,
} from '@/lib/carta-plato-marbella'

export type PublicMenuRow = {
  articulo_id: number
  carta_nombre: string
  carta_nombre_es: string | null
  carta_nombre_ca: string | null
  carta_nombre_en: string | null
  precio: number | string | null
  /** Par entero/medio fusionado (solo presentación). */
  precio_medio_display?: number | string | null
  carta_dual_racion_enabled?: boolean | null
  override_precio_medio?: number | string | null
  carta_racion_entero_es?: string | null
  carta_racion_entero_ca?: string | null
  carta_racion_entero_en?: string | null
  carta_racion_medio_es?: string | null
  carta_racion_medio_ca?: string | null
  carta_racion_medio_en?: string | null
  photo_url: string | null
  carta_photo_scale?: CartaPhotoScale | string | null
  sort_order: number | null
  category_parent_id: string | null
  category_parent_name: string | null
  category_parent_name_es?: string | null
  category_parent_name_ca?: string | null
  category_parent_name_en?: string | null
  category_parent_sort_order: number | null
  category_parent_cover_photo_url: string | null
  category_child_id: string | null
  category_child_name: string | null
  category_child_name_es?: string | null
  category_child_name_ca?: string | null
  category_child_name_en?: string | null
  category_child_sort_order: number | null
  category_child_slug?: string | null
  recipe_id?: string | null
  tpv_factor_porcion?: number | null
  plato_marbella_slot?: string | null
  plato_marbella_is_menu_price?: boolean | null
  plato_marbella_hide_name?: boolean | null
}

type Group = {
  key: string
  title: string
  /** Nombre padre en BD (español base) para orden fijo */
  parentTitleRaw: string
  sortOrder: number
  coverPhotoUrl: string | null
  coverPhotoScale: CartaPhotoScale
  subs: Map<string, { key: string; title: string; sortOrder: number; rows: PublicMenuRow[] }>
}

export function PublicCarta({
  items,
  menuCategories = [],
  categoryCoverById = {},
  categoryCoverScaleById = {},
  backHref,
  cartaEditHref,
}: {
  items: PublicMenuRow[]
  menuCategories?: MenuCategoryCatalogEntry[]
  categoryCoverById?: Record<string, string | null>
  categoryCoverScaleById?: Record<string, CartaPhotoScale>
  /** Solo usuarios autenticados: destino del botón volver (Inicio). */
  backHref: string | null
  cartaEditHref: string | null
}) {
  const platoMarbellaCategoryId = platoMarbellaCategoryIdFromCatalog(menuCategories)
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [selectedSubKeyByGroup, setSelectedSubKeyByGroup] = useState<Record<string, string>>({})
  const [lang, setLang] = useState<CartaLang>(DEFAULT_CARTA_LANG)
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null)

  const grouped = useMemo(() => {
    const groups = new Map<string, Group>()

    const catalog = menuCategories
    const pmId = platoMarbellaCategoryId

    for (const raw of items) {
      const row = bucketMenuRowForPlatoMarbella(raw, pmId, catalog)
      const parentTitleRaw = (row.category_parent_name?.trim() || 'Sin categoría').trim()
      const parentTitle = getCartaParentCategoryLabel(lang, row, tPublicUi(lang).uncategorized)
      const parentSort = row.category_parent_sort_order ?? 9999
      const parentKey = row.category_parent_id ?? `__no_parent__:${parentTitleRaw}`

      const childTitle = (row.category_child_name?.trim() || '').trim()
      const childSort = row.category_child_sort_order ?? 9999
      const childKey = row.category_child_id ?? `__no_child__:${childTitle}`

      const g = groups.get(parentKey) ?? {
        key: parentKey,
        title: parentTitle,
        parentTitleRaw,
        sortOrder: parentSort,
        coverPhotoUrl: null as string | null,
        coverPhotoScale: categoryCoverScaleById[parentKey] ?? 'm',
        subs: new Map(),
      }
      const cov = row.category_parent_cover_photo_url?.trim()
      if (cov) g.coverPhotoUrl = cov
      if (categoryCoverScaleById[parentKey]) g.coverPhotoScale = categoryCoverScaleById[parentKey]

      const sg =
        g.subs.get(childKey) ?? {
          key: childKey,
          title: getCartaChildCategoryLabel(lang, row, parentTitleRaw, childTitle),
          sortOrder: childSort,
          rows: [] as PublicMenuRow[],
        }
      sg.rows.push(row)
      g.subs.set(childKey, sg)
      groups.set(parentKey, g)
    }

    const groupList = Array.from(groups.values()).sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
      return a.parentTitleRaw.localeCompare(b.parentTitleRaw, 'es', { sensitivity: 'base' })
    })

    for (const g of groupList) {
      const subList = Array.from(g.subs.values()).sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
        return a.title.localeCompare(b.title, 'es', { sensitivity: 'base' })
      })
      for (const s of subList) {
        s.rows.sort(
          (a, b) =>
            (a.sort_order ?? 9999) - (b.sort_order ?? 9999) ||
            getCartaDisplayName(a, lang).localeCompare(getCartaDisplayName(b, lang), 'es', { sensitivity: 'base' })
        )
      }
      ;(g as any)._subList = subList.map((s) => ({
        ...s,
        coverPhotoUrl: categoryCoverById[s.key] ?? null,
        coverPhotoScale: categoryCoverScaleById[s.key] ?? 'm',
      }))
    }

    return groupList as Array<
      Group & {
        _subList: Array<{
          key: string
          title: string
          sortOrder: number
          rows: PublicMenuRow[]
          coverPhotoUrl: string | null
          coverPhotoScale: CartaPhotoScale
        }>
      }
    >
  }, [items, lang, menuCategories, platoMarbellaCategoryId, categoryCoverById, categoryCoverScaleById])

  const isPlatoMarbellaSub = (subKey: string, rows: PublicMenuRow[]) =>
    isPlatoMarbellaMenuSub(subKey, rows, platoMarbellaCategoryId)

  const openGroup = useMemo(
    () => (openKey ? grouped.find((g) => g.key === openKey) ?? null : null),
    [grouped, openKey]
  )

  const openHasMultipleSubs = (openGroup?._subList.length ?? 0) > 1
  const openSelectedSubKey = openGroup
    ? selectedSubKeyByGroup[openGroup.key]
    : undefined
  const openShowSubPicker = openHasMultipleSubs && !openSelectedSubKey
  const openShowSubTabs = openHasMultipleSubs && Boolean(openSelectedSubKey)

  const openActiveSub = useMemo(() => {
    if (!openGroup || openShowSubPicker) return null
    if (openHasMultipleSubs) {
      if (!openSelectedSubKey) return null
      return openGroup._subList.find((s) => s.key === openSelectedSubKey) ?? null
    }
    return openGroup._subList[0] ?? null
  }, [openGroup, openShowSubPicker, openHasMultipleSubs, openSelectedSubKey])

  const openPlatoMarbella =
    openActiveSub != null && isPlatoMarbellaSub(openActiveSub.key, openActiveSub.rows)

  const openPlatoMenuPrice = useMemo(() => {
    if (!openPlatoMarbella || !openActiveSub) return null
    return groupPlatoMarbellaItems(openActiveSub.rows).menuPrice
  }, [openPlatoMarbella, openActiveSub])

  const subCategoryButtonLabel = (
    sub: { key: string; title: string; sortOrder: number; rows: PublicMenuRow[]; coverPhotoUrl?: string | null },
    parentTitleRaw: string
  ) => {
    const row = sub.rows[0]
    const childRaw = (row?.category_child_name ?? '').trim()
    if (row) {
      const only = getCartaSubcategoryPickerLabel(lang, row, parentTitleRaw, childRaw).trim()
      if (only) return only
    }
    return sub.title.trim() || tPublicUi(lang).uncategorized
  }

  return (
    <main className="flex h-[100dvh] flex-col bg-white text-zinc-900">
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col px-5 pb-safe pt-safe md:px-8">
        <header className="shrink-0 bg-white pb-1 pt-1">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 gap-y-0.5">
            <div className="flex min-h-[52px] items-center justify-start">
              {backHref ? (
                <Link
                  href={backHref}
                  className="inline-flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center text-[#36606F] transition-colors hover:text-[#2a4a56] active:opacity-80"
                  aria-label="Volver a inicio"
                  title="Volver a inicio"
                >
                  <ChevronLeft className="h-7 w-7 sm:h-8 sm:w-8" strokeWidth={2.5} />
                </Link>
              ) : null}
            </div>

            <div className="flex justify-center px-1">
              <Image
                src="/icons/logo-white.png"
                alt="Bar La Marbella"
                width={320}
                height={86}
                className="h-10 w-auto max-w-[220px] sm:h-12 sm:max-w-[260px] md:h-14 md:max-w-[300px]"
                priority
              />
            </div>

            <div className="flex min-h-[52px] items-center justify-end">
              {cartaEditHref ? (
                <Link
                  href={cartaEditHref}
                  className="inline-flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-none border-0 bg-transparent p-0 text-[#36606F] shadow-none outline-none ring-0 transition-colors hover:text-[#2a4a56] active:opacity-80 focus-visible:ring-2 focus-visible:ring-[#36606F]/25"
                  aria-label="Editar carta"
                  title="Editar carta"
                >
                  <Pencil className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2.25} />
                </Link>
              ) : null}
            </div>
          </div>

          <div className="mt-1 w-full px-0 sm:mt-1.5">
            <CartaLangPicker lang={lang} onChange={setLang} tone="default" layout="spread" compact />
          </div>
        </header>

        <section className="mt-0 min-h-0 flex-1 overflow-hidden pb-2 sm:mt-1">
          <CartaCategoryGrid compact>
            {grouped.map((group) => (
              <CartaCategoryCard
                key={group.key}
                compact
                title={group.title}
                coverPhotoUrl={group.coverPhotoUrl}
                coverPhotoScale={group.coverPhotoScale}
                ariaExpanded={openKey === group.key}
                onClick={() => {
                  setSelectedSubKeyByGroup((p) => {
                    const n = { ...p }
                    delete n[group.key]
                    return n
                  })
                  setOpenKey((prev) => (prev === group.key ? null : group.key))
                }}
              />
            ))}
          </CartaCategoryGrid>
        </section>
      </div>

      {openGroup ? (
        <div
          className="fixed inset-0 z-[240] flex items-center justify-center p-4 pb-safe pt-4 animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby={
            openShowSubPicker || openShowSubTabs ? undefined : 'carta-section-modal-title'
          }
          aria-label={
            openShowSubPicker || openShowSubTabs ? openGroup.title : undefined
          }
        >
          <button
            type="button"
            className="absolute inset-0 bg-zinc-900/30 backdrop-blur-[2px] transition-opacity"
            aria-label="Cerrar"
            onClick={() => setOpenKey(null)}
          />
          <div
            className={cn(
              'relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-[22px] bg-white animate-in zoom-in-95 duration-200 sm:max-w-xl',
              openShowSubPicker
                ? 'h-auto'
                : openPlatoMarbella
                  ? 'h-[82vh] min-h-0 sm:h-[78vh]'
                  : 'max-h-[82vh] min-h-0 sm:max-h-[78vh]'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {!openShowSubPicker ? (
            <div
              className={cn(
                'flex shrink-0 bg-white px-3 sm:px-3.5',
                openPlatoMarbella && openShowSubTabs
                  ? 'flex-col gap-0 py-1 sm:py-1.5'
                  : openShowSubTabs
                    ? 'flex-col gap-1 py-2.5 sm:gap-1.5 sm:py-3'
                    : 'items-center justify-between gap-2 py-2.5 sm:gap-3 sm:py-3'
              )}
            >
              {openShowSubTabs ? (
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    className="inline-flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-xl text-[#36606F] active:bg-zinc-100"
                    aria-label="Cerrar"
                    onClick={() => setOpenKey(null)}
                  >
                    <X className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.5} />
                  </button>
                </div>
              ) : null}
              {openShowSubTabs ? (
                <div className="flex min-w-0 overflow-x-auto pb-0">
                  <div className="flex w-full min-w-0 flex-nowrap gap-1 sm:gap-1.5">
                    {openGroup._subList.map((sub) => {
                      const isActive = openSelectedSubKey === sub.key
                      return (
                        <CartaSubcategoryPickerButton
                          key={sub.key}
                          variant="label"
                          label={subCategoryButtonLabel(sub, openGroup.parentTitleRaw)}
                          isActive={isActive}
                          onClick={() =>
                            setSelectedSubKeyByGroup((p) => ({
                              ...p,
                              [openGroup.key]: sub.key,
                            }))
                          }
                        />
                      )
                    })}
                  </div>
                </div>
              ) : (
                <h2
                  id="carta-section-modal-title"
                  className="min-w-0 flex-1 text-left text-xs font-black uppercase leading-tight tracking-wide text-[#36606F] sm:text-sm"
                >
                  {openGroup.title}
                </h2>
              )}
              {!openShowSubTabs ? (
                <button
                  type="button"
                  className="inline-flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-xl text-[#36606F] active:bg-zinc-100"
                  aria-label="Cerrar"
                  onClick={() => setOpenKey(null)}
                >
                  <X className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.5} />
                </button>
              ) : null}
            </div>

            ) : null}

            {openPlatoMarbella && !openShowSubPicker && openGroup && openActiveSub ? (
              <PlatoMarbellaModalSubheader
                subTitle={subCategoryButtonLabel(openActiveSub, openGroup.parentTitleRaw)}
                menuPrice={openPlatoMenuPrice}
              />
            ) : null}

            <div
              className={cn(
                'bg-white',
                openShowSubPicker
                  ? 'px-2.5 py-3 sm:px-3 sm:py-4'
                  : cn(
                      'min-h-0 flex-1 overflow-y-auto overscroll-contain custom-scrollbar',
                      openPlatoMarbella
                        ? 'flex flex-col px-0 pb-0 pt-0 sm:px-0'
                        : 'px-2.5 pb-4 pt-2 sm:px-3 sm:pb-5 sm:pt-2.5'
                    )
              )}
            >
              {openShowSubPicker ? (
                <div className="px-0.5 sm:px-1">
                  <div className="flex w-full flex-nowrap gap-2 overflow-x-auto pb-0.5">
                    {openGroup._subList.map((sub) => (
                      <CartaSubcategoryPickerButton
                        key={sub.key}
                        variant="grid"
                        label={subCategoryButtonLabel(sub, openGroup.parentTitleRaw)}
                        coverPhotoUrl={sub.coverPhotoUrl}
                        coverPhotoScale={sub.coverPhotoScale}
                        onClick={() =>
                          setSelectedSubKeyByGroup((p) => ({
                            ...p,
                            [openGroup.key]: sub.key,
                          }))
                        }
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3 sm:space-y-4">
                  {(openHasMultipleSubs
                    ? openGroup._subList.filter((s) => s.key === openSelectedSubKey)
                    : openGroup._subList
                  ).map((sub) => (
                    <div
                      key={sub.key}
                      className={cn(
                        'space-y-2',
                        isPlatoMarbellaSub(sub.key, sub.rows) && 'flex min-h-0 flex-1 flex-col'
                      )}
                    >
                      {isPlatoMarbellaSub(sub.key, sub.rows) ? (
                        <PlatoMarbellaMenuView
                          rows={sub.rows}
                          lang={lang}
                          onPhotoClick={(src, alt) => setLightbox({ src, alt })}
                        />
                      ) : (
                      <div className="flex flex-col gap-y-2 sm:gap-y-2.5">
                        {chunkCartaProductGridRows(
                          mergeEnteroMedioForCartaDisplay(sub.rows),
                          3
                        ).map((chunk, chunkIdx) => {
                          const rowDensity = cartaProductGridRowDensity(chunk)
                          const isDrinkRow = isCartaDrinksSection(
                            chunk[0]?.category_parent_name
                          )
                          const rowFrameStyle = getCartaProductGridRowFrameStyle(
                            chunk,
                            isDrinkRow
                          )
                          return (
                            <div
                              key={chunkIdx}
                              className={cn(
                                'grid grid-cols-3 items-stretch gap-x-1.5 sm:gap-x-2',
                                rowDensity === 'compact' && 'gap-y-0',
                                rowDensity === 'cozy' && 'gap-y-1',
                                rowDensity === 'normal' && 'gap-y-2 sm:gap-y-2.5'
                              )}
                            >
                              {chunk.map((row) => {
                          const isDrink = isCartaDrinksSection(row.category_parent_name)
                          const showPhoto = cartaShowsProductPhoto(
                            row.category_parent_name,
                            row.photo_url
                          )
                          return (
                          <div
                            key={row.articulo_id}
                            className={cn(
                              'flex h-full min-w-0 flex-col items-center overflow-hidden rounded-2xl bg-white',
                              rowDensity === 'compact' && 'gap-0.5 sm:gap-0.5',
                              rowDensity === 'cozy' && 'gap-0.5 sm:gap-1',
                              rowDensity === 'normal' && 'gap-1 sm:gap-1.5'
                            )}
                          >
                            {showPhoto ? (
                              <div
                                className={cn(
                                  'w-full shrink-0',
                                  rowDensity === 'compact' && 'px-0.5 pt-0.5 sm:px-1 sm:pt-1',
                                  rowDensity === 'cozy' && 'px-1 pt-0.5 sm:px-1.5 sm:pt-1',
                                  rowDensity === 'normal' && 'px-1 pt-1 sm:px-1.5 sm:pt-1.5'
                                )}
                              >
                                {row.photo_url ? (
                                  <button
                                    type="button"
                                    className={cn(
                                      CARTA_PRODUCT_PHOTO_FRAME_SHELL_CLASS,
                                      'cursor-zoom-in touch-manipulation active:bg-zinc-50'
                                    )}
                                    style={rowFrameStyle}
                                    aria-label="Ver foto ampliada"
                                    onClick={() =>
                                      setLightbox({
                                        src: row.photo_url!,
                                        alt: getCartaDisplayName(row, lang),
                                      })
                                    }
                                  >
                                    <CartaMenuProductPhoto
                                      src={row.photo_url}
                                      scale={row.carta_photo_scale}
                                      isDrink={isDrink}
                                      articuloId={row.articulo_id}
                                    />
                                  </button>
                                ) : (
                                  <div
                                    className={CARTA_PRODUCT_PHOTO_FRAME_SHELL_CLASS}
                                    style={rowFrameStyle}
                                    aria-hidden
                                  >
                                    <div className="h-full w-full bg-white" />
                                  </div>
                                )}
                              </div>
                            ) : null}
                            <div
                              className={cn(
                                'flex w-full min-w-0 shrink-0 flex-col items-center',
                                rowDensity === 'compact' && 'gap-0.5 px-1.5 pb-1 sm:pb-1.5',
                                rowDensity === 'cozy' && 'gap-0.5 px-2 pb-1.5 sm:gap-1 sm:pb-2',
                                rowDensity === 'normal' && 'gap-1 px-2 pb-2 sm:gap-1.5'
                              )}
                            >
                                <p
                                  className="line-clamp-3 w-full max-w-full text-center text-[10px] font-bold leading-tight text-zinc-900 sm:text-[11px]"
                                  title={getCartaDisplayName(row, lang)}
                                >
                                  {getCartaDisplayName(row, lang)}
                                </p>
                                <CartaDualRacionPrices
                                  {...resolveCartaDualRacionLabels(row, lang)}
                                  precio={row.precio}
                                  precioMedio={row.precio_medio_display}
                                  variant="public"
                                />
                              </div>
                            </div>
                          )
                        })}
                            </div>
                          )
                        })}
                      </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {openPlatoMarbella && !openShowSubPicker ? (
              <PlatoMarbellaModalScheduleFooter lang={lang} />
            ) : null}
          </div>
        </div>
      ) : null}

      <CartaImageLightbox
        src={lightbox?.src ?? null}
        alt={lightbox?.alt ?? ''}
        title={lightbox?.alt ?? ''}
        open={lightbox != null}
        onClose={() => setLightbox(null)}
      />
    </main>
  )
}

