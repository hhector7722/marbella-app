'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PlateBuilder, PlateZone, type PlateZoneItem } from '@/components/carta/PlateBuilder'
import { formatCartaPrice } from '@/lib/carta-price-display'
import {
  chunkCartaProductGridRows,
  getCartaProductPhotoScaleFactor,
} from '@/lib/carta-product-photo'
import {
  type CartaLang,
  getCartaDisplayName,
  tPlatoMarbellaUi,
  type CartaNameRow,
} from '@/lib/carta-menu-i18n'
import {
  groupPlatoMarbellaItems,
  PLATO_MARBELLA_SLOTS,
  platoMarbellaPlateSlotLabels,
  type PlatoMarbellaMenuRow,
  type PlatoMarbellaSlot,
} from '@/lib/carta-plato-marbella'
import { eventOrderQtyFor, type EventOrderCartaControl } from '@/lib/event-order-carta'

const PRODUCT_FLEX_CELL_BASIS_CLASS =
  'basis-[calc((100%-1rem)/3)] sm:basis-[calc((100%-1.25rem)/3)]'

type OptionRow = PlatoMarbellaMenuRow & CartaNameRow
type Step = PlatoMarbellaSlot | 'complete'

type Selection = {
  row: OptionRow
  name: string
  photoUrl: string | null
}

/** Indicador de progreso discreto: ✓ Entrant · ○ Principal · ○ Guarnició. */
function BuilderProgress({
  lang,
  activeStep,
  selections,
  className,
}: {
  lang: CartaLang
  activeStep: Step
  selections: Partial<Record<PlatoMarbellaSlot, Selection>>
  className?: string
}) {
  const labels = platoMarbellaPlateSlotLabels(lang)
  return (
    <div
      className={cn('flex items-center justify-center gap-1.5 sm:gap-2', className)}
      aria-hidden
    >
      {PLATO_MARBELLA_SLOTS.map((slot, i) => {
        const done = Boolean(selections[slot])
        const active = activeStep === slot
        return (
          <Fragment key={slot}>
            {i > 0 ? <span className="h-px w-3 shrink-0 bg-zinc-200 sm:w-4" /> : null}
            <span
              className={cn(
                'flex items-center gap-1',
                done ? 'text-[#36606F]' : active ? 'text-zinc-700' : 'text-zinc-400'
              )}
            >
              {done ? (
                <Check className="h-3 w-3" strokeWidth={3.5} />
              ) : (
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    active ? 'bg-[#36606F]' : 'bg-zinc-300'
                  )}
                />
              )}
              <span className="text-[9px] font-bold uppercase tracking-wider">
                {labels[slot]}
              </span>
            </span>
          </Fragment>
        )
      })}
    </div>
  )
}

function BuilderOptionCard({
  row,
  lang,
  selected,
  onSelect,
}: {
  row: OptionRow
  lang: CartaLang
  selected: boolean
  onSelect: () => void
}) {
  const name = getCartaDisplayName(row, lang)
  const photo = row.photo_url?.trim() || null
  const hideName = Boolean(row.plato_marbella_hide_name)
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex h-full w-full min-w-0 flex-col items-center gap-1.5 rounded-2xl border bg-white p-1.5 pb-2 touch-manipulation transition-colors active:bg-zinc-50',
        selected ? 'border-[#36606F]/60 ring-1 ring-[#36606F]/20' : 'border-zinc-100'
      )}
    >
      <span className="relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-xl bg-zinc-50">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL Storage/receta
          <img
            src={photo}
            alt={name}
            loading="eager"
            decoding="async"
            className="pointer-events-none h-full w-full object-contain"
            style={{
              transform: `scale(${getCartaProductPhotoScaleFactor(row.carta_photo_scale, false)})`,
            }}
          />
        ) : (
          <span className="line-clamp-2 px-1 text-center text-[9px] font-semibold leading-tight text-zinc-300">
            {name}
          </span>
        )}
        {selected ? (
          <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#36606F] text-white shadow-sm">
            <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
          </span>
        ) : null}
      </span>
      {!hideName ? (
        <span className="line-clamp-2 w-full min-w-0 text-center text-[10px] font-bold leading-tight text-zinc-900 sm:text-[11px]">
          {name}
        </span>
      ) : null}
    </button>
  )
}

function BuilderOptionGrid({
  rows,
  lang,
  selectedId,
  onSelect,
}: {
  rows: OptionRow[]
  lang: CartaLang
  selectedId: number | null
  onSelect: (row: OptionRow) => void
}) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm font-medium text-zinc-500">
        {tPlatoMarbellaUi(lang).emptySection}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-y-2">
      {chunkCartaProductGridRows(rows, 3).map((chunk, chunkIdx) => (
        <div key={chunkIdx} className="flex w-full flex-wrap justify-center gap-x-2 sm:gap-x-2.5">
          {chunk.map((row) => (
            <div key={row.articulo_id} className={cn('flex min-w-0 flex-col', PRODUCT_FLEX_CELL_BASIS_CLASS)}>
              <BuilderOptionCard
                row={row}
                lang={lang}
                selected={row.articulo_id === selectedId}
                onSelect={() => onSelect(row)}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function BuilderCompleteSummary({
  lang,
  selections,
  menuPrice,
  onEditSlot,
}: {
  lang: CartaLang
  selections: Partial<Record<PlatoMarbellaSlot, Selection>>
  menuPrice: number | null
  onEditSlot: (slot: PlatoMarbellaSlot) => void
}) {
  const ui = tPlatoMarbellaUi(lang)
  const slotLabels = platoMarbellaPlateSlotLabels(lang)
  const priceLabel = menuPrice != null ? formatCartaPrice(menuPrice).trim() : ''
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="overflow-hidden rounded-xl border border-zinc-100 bg-white">
        {PLATO_MARBELLA_SLOTS.map((slot, i) => {
          const sel = selections[slot]
          return (
            <button
              key={slot}
              type="button"
              onClick={() => onEditSlot(slot)}
              className={cn(
                'flex w-full min-h-[48px] items-center justify-between gap-2 px-3 py-2 text-left touch-manipulation transition-colors active:bg-zinc-50',
                i > 0 && 'border-t border-zinc-100'
              )}
            >
              <span className="min-w-0 truncate text-xs text-zinc-500">
                <span className="font-black text-zinc-900">{slotLabels[slot]}</span>
                {' · '}
                <span className="font-bold text-zinc-700">{sel?.name}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#36606F]/80">
                {ui.editChoice}
              </span>
            </button>
          )
        })}
      </div>
      {menuPrice != null ? (
        <p className="pt-2 text-center text-sm font-black tabular-nums leading-none text-[#36606F]">
          {priceLabel}
        </p>
      ) : null}
    </div>
  )
}

function UnassignedMiniCard({
  row,
  lang,
  onPhotoClick,
}: {
  row: OptionRow
  lang: CartaLang
  onPhotoClick?: (src: string, alt: string) => void
}) {
  const name = getCartaDisplayName(row, lang)
  const photo = row.photo_url?.trim() || null
  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <button
        type="button"
        disabled={!photo}
        onClick={() => {
          if (photo) onPhotoClick?.(photo, name)
        }}
        aria-label={photo ? `Ver foto de ${name}` : name}
        className={cn(
          'relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-xl bg-white touch-manipulation',
          photo && 'active:bg-zinc-50'
        )}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL Storage/receta
          <img
            src={photo}
            alt={name}
            loading="eager"
            decoding="async"
            className="pointer-events-none h-full w-full object-contain"
            style={{
              transform: `scale(${getCartaProductPhotoScaleFactor(row.carta_photo_scale, false)})`,
            }}
          />
        ) : (
          <span className="line-clamp-2 px-1 text-center text-[9px] font-semibold leading-tight text-zinc-300">
            {name}
          </span>
        )}
      </button>
      <p className="line-clamp-2 w-full min-w-0 text-center text-[10px] font-bold leading-tight text-zinc-700">
        {name}
      </p>
    </div>
  )
}

export function PlatoMarbellaMenuView({
  rows,
  lang,
  showUnassigned = false,
  launcherArticuloId = null,
  onPhotoClick,
  eventOrder,
  className,
}: {
  rows: OptionRow[]
  lang: CartaLang
  showUnassigned?: boolean
  /** No listar el lanzador en «sin tramo» (ya está en Platos). */
  launcherArticuloId?: number | null
  onPhotoClick?: (src: string, alt: string) => void
  /** Pedido por evento: permite «Afegeix al demanat» al completar el plato. */
  eventOrder?: EventOrderCartaControl
  className?: string
}) {
  const ui = tPlatoMarbellaUi(lang)
  const grouped = useMemo(() => groupPlatoMarbellaItems(rows), [rows])
  const menuPrice = grouped.menuPrice
  const unassignedRows =
    launcherArticuloId != null
      ? grouped.unassigned.filter((r) => r.articulo_id !== launcherArticuloId)
      : grouped.unassigned

  const [state, setState] = useState<{
    selections: Partial<Record<PlatoMarbellaSlot, Selection>>
    activeStep: Step
  }>({ selections: {}, activeStep: 'entrante' })
  const { selections, activeStep } = state
  const listRef = useRef<HTMLDivElement>(null)

  const stepTitle: Record<PlatoMarbellaSlot, string> = {
    entrante: ui.builderStepEntrante,
    principal: ui.builderStepPrincipal,
    guarnicion: ui.builderStepGuarnicion,
  }

  const activeRows = activeStep === 'complete' ? [] : (grouped.sections[activeStep] as OptionRow[])
  const activeSelectionId =
    activeStep === 'complete' ? null : (selections[activeStep]?.row.articulo_id ?? null)
  const filledCount = PLATO_MARBELLA_SLOTS.filter((s) => selections[s]).length

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [activeStep])

  const toSelection = useCallback(
    (row: OptionRow): Selection => ({
      row,
      name: getCartaDisplayName(row, lang),
      photoUrl: row.photo_url?.trim() || null,
    }),
    [lang]
  )

  const firstUnfilled = useCallback(
    (sel: Partial<Record<PlatoMarbellaSlot, Selection>>): Step => {
      for (const s of PLATO_MARBELLA_SLOTS) {
        if (sel[s]) continue
        if ((grouped.sections[s] ?? []).length === 0) continue
        return s
      }
      return 'complete'
    },
    [grouped]
  )

  const onSelect = useCallback(
    (slot: PlatoMarbellaSlot, row: OptionRow) => {
      const sel = toSelection(row)
      setState((prev) => {
        const selections = { ...prev.selections, [slot]: sel }
        return { selections, activeStep: firstUnfilled(selections) }
      })
    },
    [toSelection, firstUnfilled]
  )

  const onEditSlot = useCallback((slot: PlatoMarbellaSlot) => {
    setState((prev) => ({ ...prev, activeStep: slot }))
  }, [])

  const onConfirmCurrent = useCallback(() => {
    setState((prev) => ({ ...prev, activeStep: firstUnfilled(prev.selections) }))
  }, [firstUnfilled])

  const onAddToOrder = useCallback(() => {
    if (!eventOrder || launcherArticuloId == null) return
    eventOrder.onQuantityChange(launcherArticuloId, eventOrderQtyFor(eventOrder, launcherArticuloId) + 1)
    toast.success(ui.addedToOrder)
  }, [eventOrder, launcherArticuloId, ui.addedToOrder])

  const zoneItem = useCallback(
    (slot: PlatoMarbellaSlot): PlateZoneItem | null => {
      const sel = selections[slot]
      if (!sel) return null
      return { photoUrl: sel.photoUrl, label: sel.name, id: String(sel.row.articulo_id) }
    },
    [selections]
  )

  const showCta = activeStep === 'complete' && Boolean(eventOrder) && launcherArticuloId != null
  const progressStatus =
    activeStep === 'complete'
      ? ui.plateComplete
      : ui.plateProgress.replace('{n}', String(filledCount))

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="shrink-0 bg-white px-2 pb-0 pt-0 sm:px-3">
        <p className="text-center text-[11px] font-semibold leading-snug text-zinc-600 sm:text-xs">
          {ui.plateTagline}
        </p>
        <p className="sr-only" role="status" aria-live="polite">
          {progressStatus}
        </p>
        <BuilderProgress
          lang={lang}
          activeStep={activeStep}
          selections={selections}
          className="mt-1.5"
        />
        <PlateBuilder
          lang={lang}
          activeSlot={activeStep === 'complete' ? null : activeStep}
          className="mx-auto mt-1.5 sm:mt-2"
        >
          <PlateZone type="entrante" item={zoneItem('entrante')} />
          <PlateZone type="principal" item={zoneItem('principal')} />
          <PlateZone type="guarnicion" item={zoneItem('guarnicion')} />
        </PlateBuilder>
        <div className="mt-1.5 pb-1.5 text-center sm:pb-2">
          <p className="text-[11px] font-black uppercase tracking-wide text-[#36606F] sm:text-xs">
            {activeStep === 'complete' ? ui.yourPlate : stepTitle[activeStep]}
          </p>
        </div>
      </div>

      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y border-t border-zinc-100 px-2 pb-2 pt-2 custom-scrollbar sm:px-3 sm:pb-2.5"
      >
        {activeStep === 'complete' ? (
          <BuilderCompleteSummary
            lang={lang}
            selections={selections}
            menuPrice={menuPrice}
            onEditSlot={onEditSlot}
          />
        ) : (
          <>
            {selections[activeStep] ? (
              <button
                type="button"
                onClick={onConfirmCurrent}
                className="mb-2 flex w-full min-h-[48px] items-center justify-between gap-2 px-1 py-2 text-left touch-manipulation transition-colors active:opacity-70"
              >
                <span className="flex min-w-0 items-center gap-2 text-[#36606F]">
                  <Check className="h-4 w-4 shrink-0" strokeWidth={3} />
                  <span className="min-w-0 truncate text-xs font-black">
                    {selections[activeStep]?.name}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                  {ui.confirmDone}
                </span>
              </button>
            ) : null}
            <BuilderOptionGrid
              rows={activeRows}
              lang={lang}
              selectedId={activeSelectionId}
              onSelect={(row) => onSelect(activeStep as PlatoMarbellaSlot, row)}
            />
            {showUnassigned && unassignedRows.length > 0 ? (
              <section className="mt-4 space-y-2 rounded-xl border border-amber-200 bg-amber-50/80 p-2">
                <h3 className="text-center text-xs font-black uppercase tracking-wide text-amber-900">
                  {ui.unassigned}
                </h3>
                <p className="text-center text-[11px] font-semibold text-amber-800">{ui.unassignedHint}</p>
                <div className="flex flex-col gap-y-2">
                  {chunkCartaProductGridRows(unassignedRows as OptionRow[], 3).map((chunk, chunkIdx) => (
                    <div key={chunkIdx} className="flex w-full flex-wrap justify-center gap-x-2 sm:gap-x-2.5">
                      {chunk.map((row) => (
                        <div key={row.articulo_id} className={cn('flex min-w-0 flex-col', PRODUCT_FLEX_CELL_BASIS_CLASS)}>
                          <UnassignedMiniCard row={row} lang={lang} onPhotoClick={onPhotoClick} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>

      {showCta ? (
        <div className="shrink-0 border-t border-zinc-100 bg-white px-3 pb-2 pt-2 sm:px-4 sm:pb-2.5">
          <Button
            variant="primary"
            layout="fill"
            instance="plat-marbella-afegir-al-demanat"
            onClick={onAddToOrder}
          >
            {menuPrice != null
              ? `${ui.addToOrder} · ${formatCartaPrice(menuPrice).trim()}`
              : ui.addToOrder}
          </Button>
        </div>
      ) : null}
    </div>
  )
}