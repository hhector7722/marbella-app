'use client'

import { Fragment, useCallback, useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'
import { PlateBuilder, PlateZone, type PlateZoneItem } from '@/components/carta/PlateBuilder'
import { useStudioCutout } from '@/components/carta/useStudioCutout'
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
  platoMarbellaSlotsForLang,
  type PlatoMarbellaMenuRow,
  type PlatoMarbellaSlot,
} from '@/lib/carta-plato-marbella'
import { eventOrderQtyFor, type EventOrderCartaControl } from '@/lib/event-order-carta'

const PRODUCT_FLEX_CELL_BASIS_CLASS =
  'basis-[calc((100%-1rem)/3)] sm:basis-[calc((100%-1.25rem)/3)]'

type OptionRow = PlatoMarbellaMenuRow & CartaNameRow

type Selection = {
  row: OptionRow
  name: string
  photoUrl: string | null
}

/** Indicador de progreso discreto: ✓ Entrant · ○ Principal · ○ Guarnició. */
function BuilderProgress({
  lang,
  activeSlot,
  selections,
  className,
}: {
  lang: CartaLang
  activeSlot: PlatoMarbellaSlot | null
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
        const active = activeSlot === slot
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
  const cutout = useStudioCutout(photo)
  const hideName = Boolean(row.plato_marbella_hide_name)
  const photoSrc = cutout?.href ?? photo
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
        {photoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL Storage/receta
          <img
            src={photoSrc}
            alt={name}
            loading="eager"
            decoding="async"
            className="pointer-events-none h-full w-full object-contain"
            crossOrigin={photoSrc.startsWith('http') ? 'anonymous' : undefined}
            style={{
              transform: `scale(${getCartaProductPhotoScaleFactor(row.carta_photo_scale, false)})`,
              ...(cutout?.isolated ? {} : { mixBlendMode: 'multiply' as const }),
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
    <div className="flex flex-col gap-y-2 pb-3">
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

export function PlatoMarbellaMenuView({
  rows,
  lang,
  launcherArticuloId = null,
  eventOrder,
  className,
}: {
  rows: OptionRow[]
  lang: CartaLang
  /** No listar el lanzador en «sin tramo» (ya está en Platos). */
  launcherArticuloId?: number | null
  /** Pedido por evento: permite «Afegeix al demanat» al completar el plato. */
  eventOrder?: EventOrderCartaControl
  className?: string
}) {
  const ui = tPlatoMarbellaUi(lang)
  const grouped = useMemo(() => groupPlatoMarbellaItems(rows), [rows])
  const menuPrice = grouped.menuPrice
  const slotLabels = platoMarbellaSlotsForLang(lang)

  const [selections, setSelections] = useState<Partial<Record<PlatoMarbellaSlot, Selection>>>({})
  const [pickerSlot, setPickerSlot] = useState<PlatoMarbellaSlot | null>(null)

  const toSelection = useCallback(
    (row: OptionRow): Selection => ({
      row,
      name: getCartaDisplayName(row, lang),
      photoUrl: row.photo_url?.trim() || null,
    }),
    [lang]
  )

  const onSelect = useCallback(
    (slot: PlatoMarbellaSlot, row: OptionRow) => {
      const sel = toSelection(row)
      setSelections((prev) => ({ ...prev, [slot]: sel }))
      setPickerSlot(null)
    },
    [toSelection]
  )

  const zoneItem = useCallback(
    (slot: PlatoMarbellaSlot): PlateZoneItem | null => {
      const sel = selections[slot]
      if (!sel) return null
      return { photoUrl: sel.photoUrl, label: sel.name, id: String(sel.row.articulo_id) }
    },
    [selections]
  )

  const onAddToOrder = useCallback(() => {
    if (!eventOrder || launcherArticuloId == null) return
    eventOrder.onQuantityChange(launcherArticuloId, eventOrderQtyFor(eventOrder, launcherArticuloId) + 1)
    toast.success(ui.addedToOrder)
  }, [eventOrder, launcherArticuloId, ui.addedToOrder])

  const requiredSlots = useMemo(
    () => PLATO_MARBELLA_SLOTS.filter((s) => (grouped.sections[s] ?? []).length > 0),
    [grouped]
  )
  const filledCount = PLATO_MARBELLA_SLOTS.filter((s) => selections[s]).length
  const isComplete = requiredSlots.length > 0 && requiredSlots.every((s) => selections[s])
  const showCta = isComplete && Boolean(eventOrder) && launcherArticuloId != null
  const progressStatus = isComplete
    ? ui.plateComplete
    : ui.plateProgress.replace('{n}', String(filledCount))

  const pickerRows = pickerSlot ? (grouped.sections[pickerSlot] as OptionRow[]) : []
  const pickerSelectedId = pickerSlot ? (selections[pickerSlot]?.row.articulo_id ?? null) : null

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
          activeSlot={pickerSlot}
          selections={selections}
          className="mt-1.5"
        />
        <PlateBuilder
          lang={lang}
          activeSlot={pickerSlot}
          className="mx-auto mt-1.5 sm:mt-2"
        >
          <PlateZone
            type="entrante"
            item={zoneItem('entrante')}
            onSelect={() => setPickerSlot('entrante')}
          />
          <PlateZone
            type="principal"
            item={zoneItem('principal')}
            onSelect={() => setPickerSlot('principal')}
          />
          <PlateZone
            type="guarnicion"
            item={zoneItem('guarnicion')}
            onSelect={() => setPickerSlot('guarnicion')}
          />
        </PlateBuilder>
      </div>

      <div className="min-h-0 flex-1" />

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

      <Modal
        open={pickerSlot != null}
        onClose={() => setPickerSlot(null)}
        title={pickerSlot ? slotLabels[pickerSlot] : ''}
        variant="standard"
        layer="derived"
        instance="plato-marbella-opcion"
        parentInstance="menu-accordion-section"
      >
        {pickerSlot ? (
          <BuilderOptionGrid
            rows={pickerRows}
            lang={lang}
            selectedId={pickerSelectedId}
            onSelect={(row) => onSelect(pickerSlot, row)}
          />
        ) : null}
      </Modal>
    </div>
  )
}
