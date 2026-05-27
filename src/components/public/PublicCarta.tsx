'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, Pencil } from 'lucide-react'
import { CartaLangPicker } from '@/components/carta/CartaLangPicker'
import { MenuAccordion, type DigitalMenuRow } from '@/components/staff/MenuAccordion'
import { DEFAULT_CARTA_LANG, type CartaLang } from '@/lib/carta-menu-i18n'
import type { CartaPhotoScale } from '@/lib/carta-product-photo'
import type { MenuCategoryCatalogEntry } from '@/lib/carta-plato-marbella'
import { resolvePlatoMarbellaCategoryId } from '@/lib/carta-plato-marbella'

export type PublicMenuRow = {
  articulo_id: number
  carta_nombre: string
  carta_nombre_es: string | null
  carta_nombre_ca: string | null
  carta_nombre_en: string | null
  precio: number | string | null
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

export function publicMenuRowsToDigitalMenu(items: PublicMenuRow[]): DigitalMenuRow[] {
  return items.map((row) => ({
    articulo_id: row.articulo_id,
    articulo_nombre: row.carta_nombre,
    carta_nombre: row.carta_nombre,
    carta_nombre_es: row.carta_nombre_es,
    carta_nombre_ca: row.carta_nombre_ca,
    carta_nombre_en: row.carta_nombre_en,
    departamento_id: null,
    departamento_nombre: null,
    category_id: row.category_child_id ?? row.category_parent_id,
    category_parent_id: row.category_parent_id,
    category_parent_name: row.category_parent_name,
    category_parent_name_es: row.category_parent_name_es,
    category_parent_name_ca: row.category_parent_name_ca,
    category_parent_name_en: row.category_parent_name_en,
    category_parent_sort_order: row.category_parent_sort_order,
    category_parent_cover_photo_url: row.category_parent_cover_photo_url,
    category_child_id: row.category_child_id,
    category_child_name: row.category_child_name,
    category_child_name_es: row.category_child_name_es,
    category_child_name_ca: row.category_child_name_ca,
    category_child_name_en: row.category_child_name_en,
    category_child_sort_order: row.category_child_sort_order,
    category_child_slug: row.category_child_slug,
    plato_marbella_slot: row.plato_marbella_slot,
    plato_marbella_is_menu_price: row.plato_marbella_is_menu_price,
    plato_marbella_hide_name: row.plato_marbella_hide_name,
    recipe_id: row.recipe_id ?? '',
    recipe_name: '',
    descripcion: null,
    precio: row.precio,
    precio_medio_display: row.precio_medio_display,
    carta_dual_racion_enabled: row.carta_dual_racion_enabled,
    override_precio_medio: row.override_precio_medio,
    carta_racion_entero_es: row.carta_racion_entero_es,
    carta_racion_entero_ca: row.carta_racion_entero_ca,
    carta_racion_entero_en: row.carta_racion_entero_en,
    carta_racion_medio_es: row.carta_racion_medio_es,
    carta_racion_medio_ca: row.carta_racion_medio_ca,
    carta_racion_medio_en: row.carta_racion_medio_en,
    photo_url: row.photo_url,
    carta_photo_scale: row.carta_photo_scale,
    sort_order: row.sort_order,
    tpv_factor_porcion: row.tpv_factor_porcion,
  }))
}

/** Misma UI que `/staff/carta` en modo lectura (MenuAccordion). */
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
  backHref: string | null
  cartaEditHref: string | null
}) {
  const [lang, setLang] = useState<CartaLang>(DEFAULT_CARTA_LANG)
  const digitalItems = publicMenuRowsToDigitalMenu(items)
  const platoMarbellaCategoryId = resolvePlatoMarbellaCategoryId(menuCategories, items)

  const containerRef = useRef<HTMLDivElement>(null)
  const logoRowRef = useRef<HTMLDivElement>(null)
  const homeGridAnchorRef = useRef<HTMLDivElement>(null)
  const langRowRef = useRef<HTMLDivElement>(null)
  const [langTop, setLangTop] = useState<number | null>(null)

  const recomputeLangTop = useMemo(() => {
    return () => {
      const container = containerRef.current
      const logoRow = logoRowRef.current
      const gridTop = homeGridAnchorRef.current
      const langRow = langRowRef.current
      if (!container || !logoRow || !gridTop || !langRow) return

      const cRect = container.getBoundingClientRect()
      const logoRect = logoRow.getBoundingClientRect()
      const gridRect = gridTop.getBoundingClientRect()
      const langRect = langRow.getBoundingClientRect()

      const mid = (logoRect.bottom + gridRect.top) / 2
      const top = mid - cRect.top - langRect.height / 2
      setLangTop(Math.max(0, top))
    }
  }, [])

  useEffect(() => {
    recomputeLangTop()
    const onResize = () => recomputeLangTop()
    window.addEventListener('resize', onResize)

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => recomputeLangTop()) : null
    if (ro) {
      if (logoRowRef.current) ro.observe(logoRowRef.current)
      if (homeGridAnchorRef.current) ro.observe(homeGridAnchorRef.current)
      if (langRowRef.current) ro.observe(langRowRef.current)
    }

    const t = window.setTimeout(() => recomputeLangTop(), 0)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('resize', onResize)
      ro?.disconnect()
    }
  }, [recomputeLangTop])

  return (
    <main className="flex h-[100dvh] flex-col bg-white text-zinc-900">
      <div
        ref={containerRef}
        className="relative mx-auto flex h-full w-full max-w-2xl flex-col px-5 pb-safe pt-safe md:px-8"
      >
        <header className="shrink-0 bg-white pb-1 pt-1">
          <div
            ref={logoRowRef}
            className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 gap-y-0.5"
          >
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
        </header>

        <div
          ref={langRowRef}
          className="absolute left-5 right-5 z-20 md:left-8 md:right-8"
          style={langTop != null ? { top: langTop } : undefined}
        >
          <CartaLangPicker lang={lang} onChange={setLang} tone="default" layout="spread" compact />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white pb-2">
          <MenuAccordion
            items={digitalItems}
            lang={lang}
            onLangChange={setLang}
            hideLangPicker
            homeGridAnchorRef={homeGridAnchorRef}
            menuCategories={menuCategories}
            categoryCoverById={categoryCoverById}
            categoryCoverScaleById={categoryCoverScaleById}
            platoMarbellaCategoryId={platoMarbellaCategoryId}
            showEmptyMenuChildCategories
            homeCompact
          />
        </div>
      </div>
    </main>
  )
}
