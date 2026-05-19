'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
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

type OptionRow = PlatoMarbellaMenuRow & CartaNameRow

function OptionGridCard({
  row,
  lang,
  onPhotoClick,
  rowFrameStyle,
  rowDensity,
}: {
  row: OptionRow
  lang: CartaLang
  onPhotoClick?: (src: string, alt: string) => void
  rowFrameStyle: CSSProperties
  rowDensity: 'compact' | 'cozy' | 'normal'
}) {
  const name = getCartaDisplayName(row, lang)
  const photo = row.photo_url?.trim() || null
  const layoutFactor = getCartaProductPhotoScaleFactor(row.carta_photo_scale, false)
  const frameStyle = getCartaProductPhotoFrameStyle(false, layoutFactor)

  return (
    <div
      className={cn(
        'flex h-full min-w-0 flex-col items-center overflow-hidden rounded-2xl bg-white',
        rowDensity === 'compact' && 'gap-0.5 sm:gap-0.5',
        rowDensity === 'cozy' && 'gap-0.5 sm:gap-1',
        rowDensity === 'normal' && 'gap-1 sm:gap-1.5'
      )}
    >
      <div
        className={cn(
          'w-full shrink-0',
          rowDensity === 'compact' && 'px-0.5 pt-0.5 sm:px-1 sm:pt-1',
          rowDensity === 'cozy' && 'px-1 pt-0.5 sm:px-1.5 sm:pt-1',
          rowDensity === 'normal' && 'px-1 pt-1 sm:px-1.5 sm:pt-1.5'
        )}
      >
        {photo ? (
          <button
            type="button"
            className={cn(
              CARTA_PRODUCT_PHOTO_FRAME_SHELL_CLASS,
              'min-h-[48px] w-full touch-manipulation active:bg-zinc-50'
            )}
            style={frameStyle}
            aria-label="Ver foto ampliada"
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
      <div
        className={cn(
          'flex min-h-[48px] w-full min-w-0 shrink-0 flex-col items-center justify-center',
          rowDensity === 'compact' && 'gap-0.5 px-1.5 pb-1 sm:pb-1.5',
          rowDensity === 'cozy' && 'gap-0.5 px-2 pb-1.5 sm:pb-2',
          rowDensity === 'normal' && 'gap-1 px-2 pb-2'
        )}
      >
        <p
          className="line-clamp-3 w-full max-w-full text-center text-[10px] font-bold leading-tight text-zinc-900 sm:text-[11px]"
          title={name}
        >
          {name}
        </p>
      </div>
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
  const rowDensity = 'compact' as const
  const rowFrameStyle = getCartaProductGridRowFrameStyle(chunk, false)
  const widthClass = count === 1 ? 'w-1/3' : count === 2 ? 'w-2/3' : 'w-full'
  const gridColsClass =
    count === 1 ? 'grid-cols-1' : count === 2 ? 'grid-cols-2' : 'grid-cols-3'

  return (
    <div className="flex justify-center">
      <div
        className={cn(
          'grid items-stretch gap-x-1.5 gap-y-0 sm:gap-x-2',
          widthClass,
          gridColsClass
        )}
      >
        {chunk.map((row) => (
          <OptionGridCard
            key={row.articulo_id}
            row={row}
            lang={lang}
            onPhotoClick={onPhotoClick}
            rowFrameStyle={rowFrameStyle}
            rowDensity={rowDensity}
          />
        ))}
      </div>
    </div>
  )
}

export function PlatoMarbellaMenuView({
  rows,
  lang,
  showUnassigned = false,
  onPhotoClick,
  className,
}: {
  rows: OptionRow[]
  lang: CartaLang
  showUnassigned?: boolean
  onPhotoClick?: (src: string, alt: string) => void
  className?: string
}) {
  const ui = tPlatoMarbellaUi(lang)
  const grouped = groupPlatoMarbellaItems(rows)
  const [activeSlot, setActiveSlot] = useState<PlatoMarbellaSlot>('entrante')
  const listRef = useRef<HTMLDivElement>(null)

  const activeRows = grouped.sections[activeSlot]

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [activeSlot])

  const onSlotChange = useCallback((slot: PlatoMarbellaSlot) => {
    setActiveSlot(slot)
  }, [])

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="shrink-0 space-y-1 bg-white px-2 pb-2 pt-0.5 sm:px-3">
        <p className="text-center text-xs font-semibold leading-snug text-zinc-700 sm:text-[13px]">
          {ui.plateTagline}
        </p>
        <PlatoMarbellaPlateVisual lang={lang} activeSlot={activeSlot} onSlotChange={onSlotChange} />
      </div>

      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 custom-scrollbar sm:px-3"
      >
        {activeRows.length === 0 ? (
          <p className="py-8 text-center text-sm font-medium text-zinc-500">{ui.emptySection}</p>
        ) : (
          <div className="flex flex-col gap-y-1">
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

        {showUnassigned && grouped.unassigned.length > 0 ? (
          <section className="mt-4 space-y-2 rounded-xl border border-amber-200 bg-amber-50/80 p-2">
            <h3 className="text-center text-xs font-black uppercase tracking-wide text-amber-900">
              {ui.unassigned}
            </h3>
            <p className="text-center text-[11px] font-semibold text-amber-800">{ui.unassignedHint}</p>
            <div className="flex flex-col gap-y-2">
              {chunkCartaProductGridRows(grouped.unassigned as OptionRow[], 3).map((chunk, chunkIdx) => (
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
