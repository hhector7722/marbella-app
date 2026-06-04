'use client'

import { useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, Pencil } from 'lucide-react'
import { CartaLangPicker } from '@/components/carta/CartaLangPicker'
import { MenuAccordion, type DigitalMenuRow } from '@/components/staff/MenuAccordion'
import { DEFAULT_CARTA_LANG, type CartaLang } from '@/lib/carta-menu-i18n'
import type { CartaPhotoScale } from '@/lib/carta-product-photo'
import type { MenuCategoryCatalogEntry } from '@/lib/carta-plato-marbella'
import { resolvePlatoMarbellaCategoryId } from '@/lib/carta-plato-marbella'
import type { EventEncargoEditControl, EventOrderCartaControl } from '@/lib/event-order-carta'
import { cn } from '@/lib/utils'

export type PublicMenuRow = {
  articulo_id: number
  editor_is_hidden?: boolean
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
    editor_is_hidden: row.editor_is_hidden,
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
  onEnterEncargoEdit,
  encargoEditActive = false,
  eventOrder,
  eventEncargoEdit,
  footer,
  hideEmptyMenuCategories = false,
}: {
  items: PublicMenuRow[]
  menuCategories?: MenuCategoryCatalogEntry[]
  categoryCoverById?: Record<string, string | null>
  categoryCoverScaleById?: Record<string, CartaPhotoScale>
  backHref: string | null
  cartaEditHref: string | null
  /** Botón lápiz (esquina superior derecha) para entrar en edición del encargo. */
  onEnterEncargoEdit?: () => void
  encargoEditActive?: boolean
  /** Pedido encargo: +/− en cada producto (única diferencia con la carta pública). */
  eventOrder?: EventOrderCartaControl
  eventEncargoEdit?: EventEncargoEditControl
  /** Barra inferior opcional (confirmar / guardar). */
  footer?: ReactNode
  /** Encargo: no mostrar subcategorías vacías del catálogo. */
  hideEmptyMenuCategories?: boolean
}) {
  const [lang, setLang] = useState<CartaLang>(DEFAULT_CARTA_LANG)
  const digitalItems = publicMenuRowsToDigitalMenu(items)
  const platoMarbellaCategoryId = resolvePlatoMarbellaCategoryId(menuCategories, items)

  return (
    <main className="flex h-[100svh] max-h-[100svh] flex-col bg-white text-zinc-900">
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
              {onEnterEncargoEdit ? (
                <button
                  type="button"
                  onClick={onEnterEncargoEdit}
                  className={cn(
                    'inline-flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-none border-0 bg-transparent p-0 text-[#36606F] shadow-none outline-none ring-0 transition-colors hover:text-[#2a4a56] active:opacity-80 focus-visible:ring-2 focus-visible:ring-[#36606F]/25',
                    encargoEditActive && 'opacity-50'
                  )}
                  aria-label={encargoEditActive ? 'Edición activa' : 'Editar encargo'}
                  title={encargoEditActive ? 'Modo edición' : 'Editar encargo'}
                >
                  <Pencil className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2.25} />
                </button>
              ) : cartaEditHref ? (
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
          <div className="mt-1 w-full translate-y-3 px-0 sm:mt-1.5 sm:translate-y-4">
            <CartaLangPicker lang={lang} onChange={setLang} tone="default" layout="spread" compact />
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar bg-white pb-2">
          <MenuAccordion
            items={digitalItems}
            lang={lang}
            onLangChange={setLang}
            hideLangPicker
            menuCategories={menuCategories}
            categoryCoverById={categoryCoverById}
            categoryCoverScaleById={categoryCoverScaleById}
            platoMarbellaCategoryId={platoMarbellaCategoryId}
            showEmptyMenuChildCategories={!hideEmptyMenuCategories}
            homeCompact
            eventOrder={eventOrder}
            eventEncargoEdit={eventEncargoEdit}
          />
        </div>
        {footer ? <div className="shrink-0">{footer}</div> : null}
      </div>
    </main>
  )
}
