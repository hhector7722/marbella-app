'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { formatCartaPrice } from '@/lib/carta-price-display'
import { cn } from '@/lib/utils'
import { CartaMenuProductPhoto } from '@/components/carta/CartaMenuProductPhoto'
import { PlatoMarbellaPlateVisual } from '@/components/carta/PlatoMarbellaPlateVisual'
import {
  type CartaLang,
  getCartaDisplayName,
  tPlatoMarbellaUi,
  type CartaNameRow,
} from '@/lib/carta-menu-i18n'
import {
  groupPlatoMarbellaItems,
  PLATO_MARBELLA_SLOTS,
  type PlatoMarbellaMenuRow,
  type PlatoMarbellaSlot,
} from '@/lib/carta-plato-marbella'
import {
  CARTA_PRODUCT_PHOTO_FRAME_SHELL_CLASS,
  chunkCartaProductGridRows,
  getCartaProductGridRowFrameStyle,
  getCartaProductPhotoFrameStyle,
  getCartaProductPhotoScaleFactor,
} from '@/lib/carta-product-photo'

const PRODUCT_ROW_MIN_REM = 5.25

type OptionRow = PlatoMarbellaMenuRow & CartaNameRow

function OptionGridCard({
  row,
  lang,
  hideName,
  onPhotoClick,
  rowFrameStyle,
}: {
  row: OptionRow
  lang: CartaLang
  hideName: boolean
  onPhotoClick?: (src: string, alt: string) => void
  rowFrameStyle: CSSProperties
}) {
  const name = getCartaDisplayName(row, lang)
  const priceLabel = formatCartaPrice(row.precio).trim()
  const showPrice = !row.plato_marbella_is_menu_price && priceLabel.length > 0
  const photo = row.photo_url?.trim() || null
  const layoutFactor = getCartaProductPhotoScaleFactor(row.carta_photo_scale, false)
  const frameStyle = getCartaProductPhotoFrameStyle(false, layoutFactor)

  return (
    <div className="flex h-full min-w-0 flex-col items-center overflow-hidden rounded-2xl bg-white">
      <div className={cn('w-full shrink-0 px-0.5 pt-0 sm:px-1')}>
        {photo ? (
          <button
            type="button"
            className={cn(
              CARTA_PRODUCT_PHOTO_FRAME_SHELL_CLASS,
              'min-h-[48px] w-full touch-manipulation active:bg-zinc-50'
            )}
            style={frameStyle}
            aria-label={hideName ? name : 'Ver foto ampliada'}
            onClick={() => onPhotoClick?.(photo, name)}
          >
            <CartaMenuProductPhoto src={photo} scale={row.carta_photo_scale} isDrink={false} />
          </button>
        ) : (
          <div
            className={cn(CARTA_PRODUCT_PHOTO_FRAME_SHELL_CLASS, 'w-full bg-zinc-50')}
            style={rowFrameStyle}
            aria-hidden
          />
        )}
      </div>
      {!hideName || showPrice ? (
        <div className="flex w-full min-w-0 shrink-0 items-start justify-center gap-1 px-0.5 pb-0 pt-px">
          {!hideName ? (
            <p
              className={cn(
                'min-w-0 text-center text-[10px] font-bold leading-tight text-zinc-900 sm:text-[11px]',
                showPrice ? 'line-clamp-2 flex-1' : 'line-clamp-3 w-full'
              )}
              title={name}
            >
              {name}
            </p>
          ) : null}
          {showPrice ? (
            <span className="shrink-0 text-[9px] font-black tabular-nums leading-tight text-[#36606F] sm:text-[10px]">
              {priceLabel}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function CenteredProductRow({
  chunk,
  lang,
  onPhotoClick,
}: {
  chunk: OptionRow[]
  lang: CartaLang
  onPhotoClick?: (src: string, alt: string) => void
}) {
  const count = chunk.length
  const rowFrameStyle = getCartaProductGridRowFrameStyle(chunk, false)
  const gridColsClass =
    count === 1 ? 'grid-cols-1' : count === 2 ? 'grid-cols-2' : 'grid-cols-3'

  const grid = (
    <div
      className={cn(
        'grid items-stretch gap-x-2 gap-y-0 sm:gap-x-2.5',
        gridColsClass,
        count === 1 ? 'w-1/3' : 'w-full'
      )}
    >
      {chunk.map((row) => (
        <OptionGridCard
          key={row.articulo_id}
          row={row}
          lang={lang}
          hideName={Boolean(row.plato_marbella_hide_name)}
          onPhotoClick={onPhotoClick}
          rowFrameStyle={rowFrameStyle}
        />
      ))}
    </div>
  )

  if (count === 1) {
    return <div className="flex justify-center">{grid}</div>
  }

  return grid
}

export function PlatoMarbellaMenuView({
  rows,
  lang,
  showUnassigned = false,
  launcherArticuloId = null,
  onPhotoClick,
  className,
}: {
  rows: OptionRow[]
  lang: CartaLang
  showUnassigned?: boolean
  /** No listar el lanzador en «sin tramo» (ya está en Platos). */
  launcherArticuloId?: number | null
  onPhotoClick?: (src: string, alt: string) => void
  className?: string
}) {
  const ui = tPlatoMarbellaUi(lang)
  const grouped = groupPlatoMarbellaItems(rows)
  const unassignedRows =
    launcherArticuloId != null
      ? grouped.unassigned.filter((r) => r.articulo_id !== launcherArticuloId)
      : grouped.unassigned
  const [activeSlot, setActiveSlot] = useState<PlatoMarbellaSlot>('entrante')
  const listRef = useRef<HTMLDivElement>(null)

  const activeRows = grouped.sections[activeSlot]

  const maxProductRows = useMemo(() => {
    let max = 1
    for (const slot of PLATO_MARBELLA_SLOTS) {
      const rowsInSlot = grouped.sections[slot] as OptionRow[]
      const rowCount = chunkCartaProductGridRows(rowsInSlot, 3).length
      if (rowCount > max) max = rowCount
    }
    return max
  }, [grouped])

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [activeSlot])

  const onSlotChange = useCallback((slot: PlatoMarbellaSlot) => {
    setActiveSlot(slot)
  }, [])

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="shrink-0 bg-white px-2 pb-0 pt-0 sm:px-3">
        <p className="text-center text-xs font-semibold leading-snug text-zinc-700 sm:text-[13px]">
          {ui.plateExploreHint}
        </p>
        <PlatoMarbellaPlateVisual
          lang={lang}
          activeSlot={activeSlot}
          onSlotChange={onSlotChange}
          className="mt-4 sm:mt-5"
        />
      </div>

      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2 pt-0 custom-scrollbar sm:px-3"
        style={{ minHeight: `${maxProductRows * PRODUCT_ROW_MIN_REM}rem` }}
      >
        {activeRows.length === 0 ? (
          <p className="py-6 text-center text-sm font-medium text-zinc-500">{ui.emptySection}</p>
        ) : (
          <div className="flex flex-col gap-y-0.5">
            {chunkCartaProductGridRows(activeRows as OptionRow[], 3).map((chunk, chunkIdx) => (
              <CenteredProductRow
                key={chunkIdx}
                chunk={chunk as OptionRow[]}
                lang={lang}
                onPhotoClick={onPhotoClick}
              />
            ))}
          </div>
        )}

        {showUnassigned && unassignedRows.length > 0 ? (
          <section className="mt-4 space-y-2 rounded-xl border border-amber-200 bg-amber-50/80 p-2">
            <h3 className="text-center text-xs font-black uppercase tracking-wide text-amber-900">
              {ui.unassigned}
            </h3>
            <p className="text-center text-[11px] font-semibold text-amber-800">{ui.unassignedHint}</p>
            <div className="flex flex-col gap-y-2">
              {chunkCartaProductGridRows(unassignedRows as OptionRow[], 3).map((chunk, chunkIdx) => (
                <CenteredProductRow
                  key={chunkIdx}
                  chunk={chunk as OptionRow[]}
                  lang={lang}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
