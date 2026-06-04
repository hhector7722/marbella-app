'use client'

import { useCallback, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  type CartaLang,
  tPlatoMarbellaUi,
  type CartaNameRow,
} from '@/lib/carta-menu-i18n'
import {
  groupPlatoMarbellaItems,
  platoMarbellaSlotsForLang,
  PLATO_MARBELLA_SLOTS,
  type PlatoMarbellaMenuRow,
  type PlatoMarbellaReorderSection,
  type PlatoMarbellaSlot,
} from '@/lib/carta-plato-marbella'
import {
  cartaProductGridRowDensity,
  chunkCartaProductGridRows,
  getCartaProductGridRowFrameStyle,
} from '@/lib/carta-product-photo'
import { PlatoMarbellaExploreHint } from '@/components/carta/PlatoMarbellaExploreHint'
import { PlatoMarbellaPlateVisual } from '@/components/carta/PlatoMarbellaPlateVisual'
import {
  CartaStaffMenuProductCard,
  type CartaStaffMenuProductRow,
} from '@/components/carta/CartaStaffMenuProductCard'
import { type EventOrderCartaControl } from '@/lib/event-order-carta'

type StaffRow = PlatoMarbellaMenuRow & CartaNameRow & CartaStaffMenuProductRow
const PRODUCT_FLEX_CELL_BASIS_CLASS =
  'basis-[calc((100%-1rem)/3)] sm:basis-[calc((100%-1.25rem)/3)]'

function ProductGrid({
  rows,
  lang,
  editMode,
  productReorderMode,
  reorderPick,
  onEditProduct,
  onToggleProductActive,
  productToggleBusyId,
  onReorderTap,
  eventOrder,
}: {
  rows: StaffRow[]
  lang: CartaLang
  editMode?: boolean
  productReorderMode?: boolean
  reorderPick?: string | null
  onEditProduct?: (articuloId: number) => void
  onToggleProductActive?: (articuloId: number) => void
  productToggleBusyId?: number | null
  onReorderTap?: (articuloId: number) => void
  eventOrder?: EventOrderCartaControl
}) {
  if (rows.length === 0) {
    return (
      <p className="py-4 text-center text-sm font-medium text-zinc-500">
        {tPlatoMarbellaUi(lang).emptySection}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-y-2 sm:gap-y-2.5">
      {chunkCartaProductGridRows(rows, 3).map((chunk, chunkIdx) => {
        const rowDensity = cartaProductGridRowDensity(chunk)
        const rowFrameStyle = getCartaProductGridRowFrameStyle(chunk, false)
        return (
          <div
            key={chunkIdx}
            className={cn(
              'flex w-full flex-wrap justify-center gap-x-2 sm:gap-x-2.5',
              'items-stretch',
              rowDensity === 'compact' && 'gap-y-0',
              rowDensity === 'cozy' && 'gap-y-1',
              rowDensity === 'normal' && 'gap-y-2.5 md:gap-y-3'
            )}
          >
              {chunk.map((row, cellIndex) => {
                const picked = productReorderMode && reorderPick === String(row.articulo_id)
                return (
                  <div
                    key={row.articulo_id}
                    role={productReorderMode && onReorderTap ? 'presentation' : undefined}
                    className={cn(
                      'flex min-w-0 flex-col items-center',
                      PRODUCT_FLEX_CELL_BASIS_CLASS,
                      'h-full',
                      productReorderMode &&
                        onReorderTap &&
                        'cursor-pointer rounded-2xl touch-manipulation',
                      picked && 'bg-amber-100/90'
                    )}
                    onClick={
                      productReorderMode && onReorderTap
                        ? (e) => {
                            if ((e.target as HTMLElement).closest('button')) return
                            onReorderTap(row.articulo_id)
                          }
                        : undefined
                    }
                  >
                    <CartaStaffMenuProductCard
                      row={row}
                      lang={lang}
                      editMode={editMode}
                      productReorderMode={productReorderMode}
                      onEditProduct={onEditProduct}
                      onToggleProductActive={onToggleProductActive}
                      productToggleBusyId={productToggleBusyId}
                      onReorderTap={onReorderTap}
                      rowDensity={rowDensity}
                      photoFrameStyle={rowFrameStyle}
                      eventOrder={eventOrder}
                    />
                  </div>
                )
              })}
          </div>
        )
      })}
    </div>
  )
}

export function PlatoMarbellaStaffGridView({
  rows,
  lang,
  launcherArticuloId = null,
  reorderMode = false,
  reorderSection = 'entrante',
  reorderPick,
  orderedIds,
  onReorderTap,
  onEditProduct,
  onToggleProductActive,
  productToggleBusyId,
  eventOrder,
  className,
}: {
  rows: StaffRow[]
  lang: CartaLang
  launcherArticuloId?: number | null
  reorderMode?: boolean
  reorderSection?: PlatoMarbellaReorderSection
  reorderPick?: string | null
  orderedIds?: number[] | null
  onReorderTap?: (articuloId: number) => void
  onEditProduct?: (articuloId: number) => void
  onToggleProductActive?: (articuloId: number) => void
  productToggleBusyId?: number | null
  eventOrder?: EventOrderCartaControl
  className?: string
}) {
  const ui = tPlatoMarbellaUi(lang)
  const slotLabels = platoMarbellaSlotsForLang(lang)
  const grouped = groupPlatoMarbellaItems(rows)
  const [activeSlot, setActiveSlot] = useState<PlatoMarbellaSlot>('entrante')

  const unassignedRows =
    launcherArticuloId != null
      ? (grouped.unassigned.filter((r) => r.articulo_id !== launcherArticuloId) as StaffRow[])
      : (grouped.unassigned as StaffRow[])

  const rowById = useMemo(() => new Map(rows.map((r) => [r.articulo_id, r])), [rows])

  const reorderRows = useMemo(() => {
    if (!reorderMode) return []
    const source =
      reorderSection === 'unassigned'
        ? unassignedRows
        : (grouped.sections[reorderSection] as StaffRow[])
    if (!orderedIds?.length) return source
    const out: StaffRow[] = []
    for (const id of orderedIds) {
      const r = rowById.get(id)
      if (r) out.push(r)
    }
    return out
  }, [reorderMode, reorderSection, unassignedRows, grouped.sections, orderedIds, rowById])

  const onSlotChange = useCallback((slot: PlatoMarbellaSlot) => {
    setActiveSlot(slot)
  }, [])

  const gridProps = {
    lang,
    editMode: !reorderMode && !eventOrder,
    productReorderMode: reorderMode,
    reorderPick,
    onEditProduct,
    onToggleProductActive,
    productToggleBusyId,
    onReorderTap,
    eventOrder: reorderMode ? undefined : eventOrder,
  }

  if (reorderMode) {
    return (
      <div className={cn('min-h-0 flex-1 overflow-y-auto px-2 py-2 custom-scrollbar sm:px-3', className)}>
        <p className="mb-3 text-center text-[11px] font-black uppercase tracking-wide text-[#36606F]">
          {reorderSection === 'unassigned' ? ui.unassigned : slotLabels[reorderSection]}
        </p>
        <ProductGrid rows={reorderRows} {...gridProps} />
      </div>
    )
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="shrink-0 bg-white px-2 pb-0 pt-0 sm:px-3">
        <PlatoMarbellaExploreHint text={ui.plateExploreHint} />
        <PlatoMarbellaPlateVisual
          lang={lang}
          activeSlot={activeSlot}
          onSlotChange={onSlotChange}
          className="mt-4 sm:mt-5"
        />
      </div>

      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y px-2 pt-3 custom-scrollbar sm:px-3 sm:pt-4',
          eventOrder ? 'scroll-pb-end-cards pb-6' : 'pb-2'
        )}
      >
        <ProductGrid rows={grouped.sections[activeSlot] as StaffRow[]} {...gridProps} />

        {activeSlot === 'entrante' && grouped.priceOnlyRows.length > 0 ? (
          <section className="mt-4 space-y-2 border-t border-zinc-100 pt-4">
            <h3 className="text-center text-[11px] font-black uppercase tracking-wide text-[#36606F]">
              {ui.staffMenuPriceSection}
            </h3>
            <ProductGrid rows={grouped.priceOnlyRows as StaffRow[]} {...gridProps} />
          </section>
        ) : null}

        {unassignedRows.length > 0 ? (
          <section className="mt-4 space-y-2 rounded-xl border border-amber-200 bg-amber-50/80 p-2">
            <h3 className="text-center text-xs font-black uppercase tracking-wide text-amber-900">
              {ui.unassigned}
            </h3>
            <p className="text-center text-[11px] font-semibold text-amber-800">{ui.unassignedHint}</p>
            <ProductGrid rows={unassignedRows} {...gridProps} />
          </section>
        ) : null}
        {eventOrder ? <div className="scroll-end-touch-cards" aria-hidden /> : null}
      </div>
    </div>
  )
}
