'use client'

import { useEffect, useState, type MouseEvent } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { CartaImageLightbox } from '@/components/carta/CartaImageLightbox'
import { CartaDualRacionPrices } from '@/components/carta/CartaDualRacionPrices'
import { CartaMenuProductPhoto } from '@/components/carta/CartaMenuProductPhoto'
import {
  type CartaDualRacionLabelFields,
  resolveCartaDualRacionLabels,
} from '@/lib/carta-dual-racion'
import { getCartaDisplayName, type CartaLang, type CartaNameRow } from '@/lib/carta-menu-i18n'
import {
  CARTA_PRODUCT_PHOTO_CELL_CLASS,
  CARTA_PRODUCT_PHOTO_PRODUCT_FRAME_SHELL_CLASS,
  type CartaPhotoScale,
  type CartaProductGridRowDensity,
  getCartaProductPhotoFrameStyle,
  getCartaProductPhotoScaleFactor,
  isCartaDrinksSection,
} from '@/lib/carta-product-photo'
import { EventCartaOrderControls } from '@/components/carta/EventCartaOrderControls'
import { Modal } from '@/components/ui/modal'
import { formatCartaPrice } from '@/lib/carta-price-display'
import {
  eventOrderProductId,
  eventOrderQtyFor,
  type EventOrderCartaControl,
} from '@/lib/event-order-carta'
import { cn } from '@/lib/utils'

export type CartaStaffMenuProductRow = CartaNameRow &
  CartaDualRacionLabelFields & {
    articulo_id: number
    category_parent_name?: string | null
    carta_photo_scale?: CartaPhotoScale | string | null
    photo_url?: string | null
    precio?: number | string | null
    precio_medio_display?: number | string | null
    medio_articulo_id?: number | null
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
  eventOrder,
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
  eventOrder?: EventOrderCartaControl
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [racionPickerOpen, setRacionPickerOpen] = useState(false)
  const displayName =
    isPlatoMarbellaLauncher && platoLauncherTitle?.trim()
      ? platoLauncherTitle.trim()
      : getCartaDisplayName(row, lang)
  const isActive = editMode ? !(row.editor_is_hidden ?? false) : true
  const busy = editMode && productToggleBusyId === row.articulo_id
  const eventOrderActive = Boolean(eventOrder) && !editMode && !productReorderMode
  const medioArticuloId =
    row.medio_articulo_id != null && Number(row.medio_articulo_id) > 0
      ? Number(row.medio_articulo_id)
      : null
  /** Tiene ración medio (mismo artículo TPV o par emparejado). */
  const hasDualRacion = Boolean(row.precio_medio_display)
  /** Pedido = fotocopia de carta: tap añade (o abre picker si hay mitad). */
  const eventTapToAdd = eventOrderActive && Boolean(eventOrder?.tapToAdd)
  const eventStepper = eventOrderActive && !eventOrder?.tapToAdd
  const eventQty = eventOrderQtyFor(eventOrder, row.articulo_id, 'entero')
  const eventQtyMedio = hasDualRacion
    ? medioArticuloId != null
      ? eventOrderQtyFor(eventOrder, medioArticuloId, 'entero')
      : eventOrderQtyFor(eventOrder, row.articulo_id, 'medio')
    : 0
  const eventQtyTotal = eventQty + eventQtyMedio
  const productId = eventOrderProductId(row.articulo_id)
  const dualLabels = resolveCartaDualRacionLabels(row, lang)
  const priceEnteroLabel = formatCartaPrice(row.precio)
  const priceMedioLabel = formatCartaPrice(row.precio_medio_display)

  const addEntero = () => {
    if (!eventOrder) return
    eventOrder.onQuantityChange(row.articulo_id, Math.min(999, eventQty + 1), {
      portion: 'entero',
    })
  }

  const addMedio = () => {
    if (!eventOrder) return
    if (medioArticuloId != null) {
      eventOrder.onQuantityChange(medioArticuloId, Math.min(999, eventQtyMedio + 1), {
        portion: 'entero',
      })
    } else {
      eventOrder.onQuantityChange(row.articulo_id, Math.min(999, eventQtyMedio + 1), {
        portion: 'medio',
      })
    }
  }

  const handleTapAdd = (e: MouseEvent) => {
    if (!eventOrder || !eventTapToAdd) return
    e.preventDefault()
    e.stopPropagation()
    if (hasDualRacion) {
      setRacionPickerOpen(true)
      return
    }
    addEntero()
  }

  useEffect(() => {
    if (editMode) {
      setLightboxOpen(false)
      setRacionPickerOpen(false)
    }
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
            CARTA_PRODUCT_PHOTO_CELL_CLASS,
            'shrink-0',
            row.photo_url && 'relative',
            rowDensity === 'compact' && 'pt-0.5',
            rowDensity === 'cozy' && 'pt-0.5',
            rowDensity === 'normal' && 'pt-1'
          )}
        >
          {row.photo_url ? (
            <>
              <button
                type="button"
                className={cn(
                  CARTA_PRODUCT_PHOTO_PRODUCT_FRAME_SHELL_CLASS,
                  'touch-manipulation active:bg-zinc-50',
                  eventTapToAdd && 'cursor-pointer',
                  productReorderMode && onReorderTap
                    ? 'cursor-pointer'
                    : editMode && onEditProduct && !productReorderMode
                      ? 'cursor-pointer'
                      : editMode
                        ? 'cursor-default'
                        : eventTapToAdd
                          ? 'cursor-pointer'
                          : 'cursor-zoom-in'
                )}
                style={frameStyle}
                aria-label={
                  eventTapToAdd
                    ? hasDualRacion
                      ? `Elegir ración de ${displayName}`
                      : `Añadir ${displayName}`
                    : productReorderMode && onReorderTap
                      ? 'Seleccionar para reordenar'
                      : editMode && onEditProduct
                        ? 'Editar producto'
                        : editMode
                          ? 'Foto del producto'
                          : 'Ver foto ampliada'
                }
                onClick={(e) => {
                  if (eventTapToAdd) {
                    handleTapAdd(e)
                    return
                  }
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
                  if (editMode && onEditProduct && !productReorderMode) {
                    e.preventDefault()
                    e.stopPropagation()
                    onEditProduct(row.articulo_id)
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
              {eventTapToAdd && eventQtyTotal > 0 ? (
                <span className="absolute right-0 top-0 z-30 min-h-6 min-w-6 rounded-full bg-[#36606F] px-1.5 text-[10px] font-black leading-6 text-white shadow-sm sm:right-0.5 sm:top-0.5">
                  ×{eventQtyTotal}
                </span>
              ) : null}
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
                    <Loader2 className="h-5 w-5 animate-spin text-[#36606F]" />
                  ) : isActive ? (
                    <Check className="h-7 w-7 text-emerald-500" strokeWidth={3.25} aria-hidden />
                  ) : (
                    <span
                      className="block h-4 w-4 rounded-full bg-red-500 ring-2 ring-white"
                      aria-hidden
                    />
                  )}
                </button>
              ) : null}
            </>
          ) : (
            <div
              className={CARTA_PRODUCT_PHOTO_PRODUCT_FRAME_SHELL_CLASS}
              style={frameStyle}
              aria-hidden
            />
          )}
        </div>
      ) : null}

      <div
        className={cn(
          'flex min-h-0 w-full shrink-0 flex-col items-center pt-0',
          rowDensity === 'compact' && 'gap-0.5 px-1.5 pb-1 sm:pb-1.5',
          rowDensity === 'cozy' && 'gap-0.5 px-2 pb-1.5 sm:gap-1 sm:pb-2',
          rowDensity === 'normal' && 'gap-1 px-2 pb-2 sm:gap-1.5',
          eventTapToAdd && 'cursor-pointer touch-manipulation active:bg-zinc-50/80',
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
          eventTapToAdd
            ? handleTapAdd
            : isPlatoMarbellaLauncher && onOpenPlatoMarbella
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
            {...dualLabels}
            precio={row.precio}
            precioMedio={row.precio_medio_display}
            variant="staff"
          />
        )}
        {eventStepper && eventOrder ? (
          <EventCartaOrderControls
            className="mt-1"
            quantity={eventQty}
            onDecrement={() =>
              eventOrder.onQuantityChange(
                row.articulo_id,
                Math.max(0, (eventOrder.qtyByProductId[productId] ?? 0) - 1)
              )
            }
            onIncrement={() =>
              eventOrder.onQuantityChange(
                row.articulo_id,
                Math.min(999, (eventOrder.qtyByProductId[productId] ?? 0) + 1)
              )
            }
            onChange={(qty) => eventOrder.onQuantityChange(row.articulo_id, qty)}
          />
        ) : null}
      </div>

      <CartaImageLightbox
        src={row.photo_url ?? null}
        alt={displayName}
        title={displayName}
        open={
          lightboxOpen &&
          !!row.photo_url &&
          !(productReorderMode && onReorderTap) &&
          !editMode &&
          !eventTapToAdd
        }
        onClose={() => setLightboxOpen(false)}
      />

      <Modal
        open={racionPickerOpen && eventOrderActive}
        onClose={() => setRacionPickerOpen(false)}
        title={displayName}
        usageId="event-carta-racion-picker"
        usageLabel="Elegir ración pedido"
        className="max-w-sm"
        zIndexClass="z-[320]"
      >
        <p className="text-center text-sm font-semibold text-zinc-600">Selecciona la ración</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            className="flex min-h-14 flex-col items-center justify-center rounded-xl bg-[#36606F] px-2 py-3 text-white active:scale-[0.98]"
            onClick={() => {
              addEntero()
              setRacionPickerOpen(false)
            }}
          >
            <span className="text-sm font-black">{dualLabels.racionEntero}</span>
            {priceEnteroLabel.trim() ? (
              <span className="mt-0.5 text-xs font-bold tabular-nums opacity-90">
                {priceEnteroLabel}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            className="flex min-h-14 flex-col items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 px-2 py-3 text-zinc-900 active:scale-[0.98]"
            onClick={() => {
              addMedio()
              setRacionPickerOpen(false)
            }}
          >
            <span className="text-sm font-black">{dualLabels.racionMedio}</span>
            {priceMedioLabel.trim() ? (
              <span className="mt-0.5 text-xs font-bold tabular-nums text-zinc-700">
                {priceMedioLabel}
              </span>
            ) : null}
          </button>
        </div>
        <button
          type="button"
          className="mt-3 flex min-h-12 w-full items-center justify-center rounded-xl bg-zinc-100 text-sm font-bold text-zinc-800 active:bg-zinc-200"
          onClick={() => setRacionPickerOpen(false)}
        >
          Cancelar
        </button>
      </Modal>
    </div>
  )
}
