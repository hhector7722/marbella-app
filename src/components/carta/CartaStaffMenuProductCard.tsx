'use client'

import { useEffect, useState } from 'react'
import { Check, Circle, Loader2 } from 'lucide-react'
import { CartaImageLightbox } from '@/components/carta/CartaImageLightbox'
import { CartaDualRacionPrices } from '@/components/carta/CartaDualRacionPrices'
import { CartaMenuProductPhoto } from '@/components/carta/CartaMenuProductPhoto'
import {
  type CartaDualRacionLabelFields,
  resolveCartaDualRacionLabels,
} from '@/lib/carta-dual-racion'
import { getCartaDisplayName, type CartaLang, type CartaNameRow } from '@/lib/carta-menu-i18n'
import {
  CARTA_PRODUCT_PHOTO_FRAME_SHELL_CLASS,
  type CartaPhotoScale,
  type CartaProductGridRowDensity,
  getCartaProductPhotoFrameStyle,
  getCartaProductPhotoScaleFactor,
  isCartaDrinksSection,
} from '@/lib/carta-product-photo'
import { cn } from '@/lib/utils'

export type CartaStaffMenuProductRow = CartaNameRow &
  CartaDualRacionLabelFields & {
    articulo_id: number
    category_parent_name?: string | null
    carta_photo_scale?: CartaPhotoScale | string | null
    photo_url?: string | null
    precio?: number | string | null
    precio_medio_display?: number | string | null
    carta_dual_racion_enabled?: boolean | null
    editor_is_hidden?: boolean
  }

export function CartaStaffMenuProductCard({
  row,
  lang,
  editMode = false,
  productReorderMode = false,
  onEditProduct,
  onToggleProductActive,
  productToggleBusyId,
  onReorderTap,
  rowDensity = 'normal',
  photoFrameStyle,
  isPlatoMarbellaLauncher = false,
  onOpenPlatoMarbella,
  platoLauncherTitle,
  platoLauncherPriceLabel,
}: {
  row: CartaStaffMenuProductRow
  lang: CartaLang
  editMode?: boolean
  productReorderMode?: boolean
  onEditProduct?: (articuloId: number) => void
  onToggleProductActive?: (articuloId: number) => void
  productToggleBusyId?: number | null
  onReorderTap?: (articuloId: number) => void
  rowDensity?: CartaProductGridRowDensity
  photoFrameStyle?: { aspectRatio?: number; height?: string }
  isPlatoMarbellaLauncher?: boolean
  onOpenPlatoMarbella?: () => void
  platoLauncherTitle?: string
  platoLauncherPriceLabel?: string
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const displayName =
    isPlatoMarbellaLauncher && platoLauncherTitle?.trim()
      ? platoLauncherTitle.trim()
      : getCartaDisplayName(row, lang)
  const isActive = editMode ? !(row.editor_is_hidden ?? false) : true
  const busy = editMode && productToggleBusyId === row.articulo_id

  useEffect(() => {
    if (editMode) setLightboxOpen(false)
  }, [editMode])

  const isDrink = isCartaDrinksSection(row.category_parent_name)
  const layoutFactor = getCartaProductPhotoScaleFactor(row.carta_photo_scale, isDrink)
  const frameStyle = photoFrameStyle ?? getCartaProductPhotoFrameStyle(isDrink, layoutFactor)

  return (
    <div
      className={cn(
        'flex h-full min-w-0 flex-col items-center overflow-hidden rounded-2xl bg-white',
        rowDensity === 'compact' && 'gap-0.5 sm:gap-0.5',
        rowDensity === 'cozy' && 'gap-0.5 sm:gap-1',
        rowDensity === 'normal' && 'gap-1 sm:gap-1.5',
        editMode && !isActive && 'opacity-75'
      )}
    >
      {photoFrameStyle || row.photo_url ? (
        <div
          className={cn(
            'w-full shrink-0',
            row.photo_url && 'relative',
            rowDensity === 'compact' && 'px-0.5 pt-0.5 sm:px-1 sm:pt-1',
            rowDensity === 'cozy' && 'px-1 pt-0.5 sm:px-1.5 sm:pt-1',
            rowDensity === 'normal' && 'px-1 pt-1 sm:px-1.5 sm:pt-1.5'
          )}
        >
          {row.photo_url ? (
            <>
              <button
                type="button"
                className={cn(
                  CARTA_PRODUCT_PHOTO_FRAME_SHELL_CLASS,
                  'touch-manipulation active:bg-zinc-50',
                  productReorderMode && onReorderTap
                    ? 'cursor-pointer'
                    : editMode
                      ? 'cursor-default'
                      : 'cursor-zoom-in'
                )}
                style={frameStyle}
                aria-label={
                  productReorderMode && onReorderTap
                    ? 'Seleccionar para reordenar'
                    : editMode
                      ? 'Foto del producto'
                      : 'Ver foto ampliada'
                }
                onClick={(e) => {
                  if (productReorderMode && onReorderTap) {
                    e.preventDefault()
                    e.stopPropagation()
                    onReorderTap(row.articulo_id)
                    return
                  }
                  if (isPlatoMarbellaLauncher && onOpenPlatoMarbella) {
                    e.preventDefault()
                    e.stopPropagation()
                    onOpenPlatoMarbella()
                    return
                  }
                  if (editMode) {
                    e.preventDefault()
                    e.stopPropagation()
                    return
                  }
                  setLightboxOpen(true)
                }}
              >
                <CartaMenuProductPhoto
                  src={row.photo_url}
                  scale={row.carta_photo_scale}
                  isDrink={isDrink}
                  articuloId={row.articulo_id}
                />
              </button>
              {editMode && onToggleProductActive ? (
                <button
                  type="button"
                  className="absolute right-0 top-0 z-20 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border-0 bg-transparent p-0 shadow-none outline-none ring-0 sm:right-0.5 sm:top-0.5 sm:min-h-[48px] sm:min-w-[48px]"
                  aria-label={isActive ? 'Desactivar en carta' : 'Activar en carta'}
                  title={isActive ? 'Visible en carta' : 'Oculto en carta'}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onToggleProductActive(row.articulo_id)
                  }}
                >
                  {busy ? (
                    <Loader2 className="h-5 w-5 animate-spin text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]" />
                  ) : isActive ? (
                    <Check className="h-7 w-7 text-emerald-400" strokeWidth={3.25} aria-hidden />
                  ) : (
                    <Circle
                      className="h-6 w-6 text-white/35 drop-shadow-[0_2px_4px_rgba(0,0,0,0.75)]"
                      strokeWidth={2.5}
                      aria-hidden
                    />
                  )}
                </button>
              ) : null}
            </>
          ) : (
            <div className={CARTA_PRODUCT_PHOTO_FRAME_SHELL_CLASS} style={frameStyle} aria-hidden />
          )}
        </div>
      ) : null}

      <div
        className={cn(
          'flex min-h-0 w-full shrink-0 flex-col items-center pt-0',
          rowDensity === 'compact' && 'gap-0.5 px-1.5 pb-1 sm:pb-1.5',
          rowDensity === 'cozy' && 'gap-0.5 px-2 pb-1.5 sm:gap-1 sm:pb-2',
          rowDensity === 'normal' && 'gap-1 px-2 pb-2 sm:gap-1.5',
          editMode &&
            onEditProduct &&
            !productReorderMode &&
            !isPlatoMarbellaLauncher &&
            'cursor-pointer touch-manipulation active:bg-zinc-50'
        )}
        role={
          editMode && onEditProduct && !productReorderMode && !isPlatoMarbellaLauncher
            ? 'button'
            : undefined
        }
        tabIndex={
          editMode && onEditProduct && !productReorderMode && !isPlatoMarbellaLauncher ? 0 : undefined
        }
        onClick={
          isPlatoMarbellaLauncher && onOpenPlatoMarbella
            ? () => onOpenPlatoMarbella()
            : editMode && onEditProduct && !productReorderMode
              ? () => onEditProduct(row.articulo_id)
              : undefined
        }
        onKeyDown={
          isPlatoMarbellaLauncher && onOpenPlatoMarbella
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onOpenPlatoMarbella()
                }
              }
            : editMode && onEditProduct && !productReorderMode
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onEditProduct(row.articulo_id)
                  }
                }
              : undefined
        }
      >
        <p
          className="line-clamp-3 w-full max-w-full text-center text-[10px] font-black leading-tight text-zinc-900 sm:text-[11px]"
          title={displayName}
        >
          {displayName}
        </p>
        {isPlatoMarbellaLauncher && platoLauncherPriceLabel?.trim() ? (
          <p className="text-center text-sm font-black text-[#36606F]">{platoLauncherPriceLabel}</p>
        ) : (
          <CartaDualRacionPrices
            {...resolveCartaDualRacionLabels(row, lang)}
            precio={row.precio}
            precioMedio={row.precio_medio_display}
            variant="staff"
          />
        )}
      </div>

      <CartaImageLightbox
        src={row.photo_url ?? null}
        alt={displayName}
        title={displayName}
        open={lightboxOpen && !!row.photo_url && !(productReorderMode && onReorderTap) && !editMode}
        onClose={() => setLightboxOpen(false)}
      />
    </div>
  )
}
