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
import { Button } from '@/components/ui/button'
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
    lightbox_photo_url?: string | null
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
  squareLayout = false,
  photoFrameStyle,
  isPlatoMarbellaLauncher = false,
  onOpenPlatoMarbella,
  platoLauncherTitle,
  platoLauncherPriceLabel,
  eventOrder,
  lightboxParentInstance,
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
  squareLayout?: boolean
  photoFrameStyle?: { aspectRatio?: number; height?: string }
  isPlatoMarbellaLauncher?: boolean
  onOpenPlatoMarbella?: () => void
  platoLauncherTitle?: string
  platoLauncherPriceLabel?: string
  eventOrder?: EventOrderCartaControl
  /** Modal padre vivo (p. ej. menu-accordion-section): lightbox y picker de ración. */
  lightboxParentInstance?: string
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [racionPickerOpen, setRacionPickerOpen] = useState(false)
  const [racionPickerAction, setRacionPickerAction] = useState<'add' | 'remove'>('add')
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
  /** La carta original permanece pulsable para ampliar fotografías. */
  const eventPhotoControls = eventOrderActive && Boolean(eventOrder?.photoControls)
  const eventTapToAdd = eventOrderActive && Boolean(eventOrder?.tapToAdd) && !eventPhotoControls
  const eventStepper = eventOrderActive && !eventOrder?.tapToAdd && !eventPhotoControls
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

  const removeEntero = () => {
    if (!eventOrder || eventQty <= 0) return
    eventOrder.onQuantityChange(row.articulo_id, Math.max(0, eventQty - 1), {
      portion: 'entero',
    })
  }

  const removeMedio = () => {
    if (!eventOrder || eventQtyMedio <= 0) return
    eventOrder.onQuantityChange(
      medioArticuloId ?? row.articulo_id,
      Math.max(0, eventQtyMedio - 1),
      { portion: medioArticuloId != null ? 'entero' : 'medio' }
    )
  }

  const requestAdd = () => {
    if (isPlatoMarbellaLauncher && eventOrder?.onAddPlatoMarbella && onOpenPlatoMarbella) {
      onOpenPlatoMarbella()
      return
    }
    if (hasDualRacion) {
      setRacionPickerAction('add')
      setRacionPickerOpen(true)
    } else {
      addEntero()
    }
  }

  const requestRemove = () => {
    if (eventQtyTotal <= 0) return
    if (isPlatoMarbellaLauncher && eventOrder?.onRemoveLastPlatoMarbella) {
      eventOrder.onRemoveLastPlatoMarbella(row.articulo_id)
      return
    }
    if (hasDualRacion && eventQty > 0 && eventQtyMedio > 0) {
      setRacionPickerAction('remove')
      setRacionPickerOpen(true)
    } else if (eventQty > 0) {
      removeEntero()
    } else {
      removeMedio()
    }
  }

  const photoOrderControls = eventPhotoControls ? (
    <div
      data-carta-order-controls
      {...(!row.photo_url ? { 'data-inline': true } : {})}
      aria-label={`Unidades de ${displayName}: ${eventQtyTotal}`}
      onClick={(e) => e.stopPropagation()}
    >
      {eventQtyTotal === 0 ? (
        <button
          type="button"
          data-action="add"
          aria-label={`Añadir ${displayName} al pedido`}
          onClick={(e) => {
            e.stopPropagation()
            requestAdd()
          }}
        >
          AÑADIR
        </button>
      ) : (
        <>
          <button
            type="button"
            data-action="remove"
            aria-label={`Quitar una unidad de ${displayName}`}
            onClick={(e) => {
              e.stopPropagation()
              requestRemove()
            }}
          >
            −
          </button>
          <button
            type="button"
            data-action="increment"
            aria-label={`Añadir una unidad de ${displayName}`}
            onClick={(e) => {
              e.stopPropagation()
              requestAdd()
            }}
          >
            +
          </button>
        </>
      )}
    </div>
  ) : null

  const handleTapAdd = (e: MouseEvent) => {
    if (!eventOrder || !eventTapToAdd) return
    e.preventDefault()
    e.stopPropagation()
    requestAdd()
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
  // Regla común para /carta, /pedido y staff: solo ampliar con imagen secundaria.
  // Excepción: todos los productos de la categoría padre «Platos» admiten ampliación.
  const canEnlargePhoto =
    Boolean(row.photo_url?.trim()) &&
    (Boolean(row.lightbox_photo_url?.trim()) ||
      row.category_parent_name?.trim().toLowerCase() === 'platos')
  const photoHasAction =
    canEnlargePhoto ||
    eventTapToAdd ||
    (productReorderMode && Boolean(onReorderTap)) ||
    (isPlatoMarbellaLauncher && Boolean(onOpenPlatoMarbella)) ||
    (editMode && Boolean(onEditProduct))

  return (
    <div
      className={cn(
        'flex h-full min-w-0 flex-col items-center overflow-hidden rounded-2xl bg-white',
        squareLayout && 'carta-square-product-card',
        rowDensity === 'compact' && 'gap-0.5 sm:gap-0.5',
        rowDensity === 'cozy' && 'gap-0.5 sm:gap-1',
        rowDensity === 'normal' && 'gap-1 sm:gap-1.5',
        editMode && !isActive && 'opacity-75'
      )}
    >
      {photoFrameStyle || row.photo_url ? (
        <div
          data-carta-product-photo
          className={cn(
            CARTA_PRODUCT_PHOTO_CELL_CLASS,
            'shrink-0',
            rowDensity === 'compact' && 'pt-0.5',
            rowDensity === 'cozy' && 'pt-0.5',
            rowDensity === 'normal' && 'pt-1'
          )}
        >
          {row.photo_url ? (
            <div className="relative w-full max-w-full">
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
                          : canEnlargePhoto
                            ? 'cursor-zoom-in'
                            : 'cursor-default'
                )}
                style={squareLayout ? undefined : frameStyle}
                disabled={!photoHasAction}
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
                          : canEnlargePhoto
                            ? 'Ver foto ampliada'
                            : 'Foto del producto'
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
                  if (canEnlargePhoto) setLightboxOpen(true)
                }}
              >
                <CartaMenuProductPhoto
                  src={row.photo_url}
                  scale={row.carta_photo_scale}
                  isDrink={isDrink}
                  articuloId={row.articulo_id}
                  squareLayout={squareLayout}
                />
              </button>
              {(eventTapToAdd || eventPhotoControls) && eventQtyTotal > 0 ? (
                <span
                  className={cn(
                    'pointer-events-none absolute right-1 top-1 z-30',
                    'inline-flex items-center justify-center',
                    'min-h-[18px] min-w-[18px] rounded-full bg-[#FF3B30] px-1',
                    'text-[10px] font-semibold tabular-nums leading-none text-white'
                  )}
                  aria-label={`${eventQtyTotal} en el pedido`}
                >
                  {eventQtyTotal > 99 ? '99+' : eventQtyTotal}
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
            </div>
          ) : (
            <div
              className={CARTA_PRODUCT_PHOTO_PRODUCT_FRAME_SHELL_CLASS}
              style={squareLayout ? undefined : frameStyle}
              aria-hidden
            />
          )}
          {eventPhotoControls ? photoOrderControls : null}
        </div>
      ) : null}

      <div
        data-carta-product-info
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
          (editMode && onEditProduct && !productReorderMode && !isPlatoMarbellaLauncher) ||
          (squareLayout && canEnlargePhoto && !editMode && !eventTapToAdd && !isPlatoMarbellaLauncher)
            ? 'button'
            : undefined
        }
        tabIndex={
          (editMode && onEditProduct && !productReorderMode && !isPlatoMarbellaLauncher) ||
          (squareLayout && canEnlargePhoto && !editMode && !eventTapToAdd && !isPlatoMarbellaLauncher)
            ? 0
            : undefined
        }
        onClick={
          eventTapToAdd
            ? handleTapAdd
            : isPlatoMarbellaLauncher && onOpenPlatoMarbella
              ? () => onOpenPlatoMarbella()
              : editMode && onEditProduct && !productReorderMode
                ? () => onEditProduct(row.articulo_id)
                : squareLayout && canEnlargePhoto
                  ? () => setLightboxOpen(true)
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
              : squareLayout && canEnlargePhoto
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setLightboxOpen(true)
                    }
                  }
                : undefined
        }
      >
        {isPlatoMarbellaLauncher && platoLauncherPriceLabel?.trim() ? (
          <p
            data-carta-display-price
            className="text-center text-sm font-black text-[#36606F]"
          >
            {platoLauncherPriceLabel}
          </p>
        ) : (
          <CartaDualRacionPrices
            {...dualLabels}
            precio={row.precio}
            precioMedio={row.precio_medio_display}
            variant="staff"
            singleLine={squareLayout && !editMode}
          />
        )}
        <p
          data-carta-display-name
          className={cn(
            'line-clamp-3 w-full max-w-full text-center text-[10px] font-black leading-tight text-zinc-900 sm:text-[11px]',
            squareLayout && displayName.length > 18 && 'carta-catalog-long-name'
          )}
          title={displayName}
        >
          {displayName}
        </p>
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
        src={row.lightbox_photo_url?.trim() || row.photo_url || null}
        alt={displayName}
        title={displayName}
        open={
          lightboxOpen &&
          canEnlargePhoto &&
          !(productReorderMode && onReorderTap) &&
          !editMode &&
          !eventTapToAdd
        }
        onClose={() => setLightboxOpen(false)}
        {...(lightboxParentInstance ? { parentInstance: lightboxParentInstance } : {})}
      />

      <Modal
        open={racionPickerOpen && eventOrderActive}
        onClose={() => setRacionPickerOpen(false)}
        title={displayName}
        usageId="event-carta-racion-picker"
        usageLabel="Elegir ración pedido"
        variant="compact"
        layer={lightboxParentInstance ? 'derived' : 'base'}
        {...(lightboxParentInstance ? { parentInstance: lightboxParentInstance } : {})}
      >
        <div className="space-y-3">
          <p className="text-center text-sm font-semibold text-zinc-600">
            {racionPickerAction === 'remove' ? 'Selecciona la ración que quieres quitar' : 'Selecciona la ración'}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              className="flex min-h-[84px] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border border-[#a6c8ef] bg-[#ecf4ff] px-2 py-3 text-[#1b4a82] transition-colors active:bg-[#ddeafa] disabled:opacity-40"
              disabled={racionPickerAction === 'remove' && eventQty <= 0}
              onClick={() => {
                if (racionPickerAction === 'remove') removeEntero()
                else addEntero()
                setRacionPickerOpen(false)
              }}
            >
              <span className="max-w-full break-words text-center text-[13px] font-extrabold leading-snug">{dualLabels.racionEntero}</span>
              {priceEnteroLabel.trim() ? (
                <span className="text-[12px] font-semibold tabular-nums">
                  {priceEnteroLabel}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className="flex min-h-[84px] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border border-[#a6c8ef] bg-[#ecf4ff] px-2 py-3 text-[#1b4a82] transition-colors active:bg-[#ddeafa] disabled:opacity-40"
              disabled={racionPickerAction === 'remove' && eventQtyMedio <= 0}
              onClick={() => {
                if (racionPickerAction === 'remove') removeMedio()
                else addMedio()
                setRacionPickerOpen(false)
              }}
            >
              <span className="max-w-full break-words text-center text-[13px] font-extrabold leading-snug">{dualLabels.racionMedio}</span>
              {priceMedioLabel.trim() ? (
                <span className="text-[12px] font-semibold tabular-nums">
                  {priceMedioLabel}
                </span>
              ) : null}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            instance="carta-staff-racion-cancel"
            onClick={() => setRacionPickerOpen(false)}
          >
            Cancelar
          </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
