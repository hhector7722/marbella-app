'use client'

import { useMemo } from 'react'
import { Check, Circle, GripVertical, Loader2, Pencil, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  type CartaLang,
  getCartaDisplayName,
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

type StaffRow = PlatoMarbellaMenuRow &
  CartaNameRow & {
    editor_is_hidden?: boolean
  }

function formatMenuPrice(precio: number | null) {
  if (precio == null || precio === 0) return ' '
  return `${precio.toFixed(2)}€`
}

function slotShortLabel(lang: CartaLang, slot: PlatoMarbellaSlot) {
  const ui = tPlatoMarbellaUi(lang)
  if (slot === 'entrante') return ui.staffSlotShortEntrante
  if (slot === 'principal') return ui.staffSlotShortPrincipal
  return ui.staffSlotShortGuarnicion
}

function StaffItemRow({
  row,
  lang,
  reorderMode,
  reorderPick,
  onReorderTap,
  onEditProduct,
  onSlotChange,
  onToggleVisible,
  busyArticuloId,
  toggleBusyId,
  savingSlotId,
}: {
  row: StaffRow
  lang: CartaLang
  reorderMode?: boolean
  reorderPick?: string | null
  onReorderTap?: (articuloId: number) => void
  onEditProduct?: (articuloId: number) => void
  onSlotChange?: (
    articuloId: number,
    slot: PlatoMarbellaSlot | null,
    isMenuPrice: boolean
  ) => void | Promise<void>
  onToggleVisible?: (articuloId: number) => void
  busyArticuloId?: number | null
  toggleBusyId?: number | null
  savingSlotId?: number | null
}) {
  const name = getCartaDisplayName(row, lang)
  const isActive = !(row.editor_is_hidden ?? false)
  const picked = reorderPick === String(row.articulo_id)
  const isMenuPrice = Boolean(row.plato_marbella_is_menu_price)
  const currentSlot = row.plato_marbella_slot as PlatoMarbellaSlot | null | undefined
  const saving = savingSlotId === row.articulo_id
  const toggleBusy = toggleBusyId === row.articulo_id

  return (
    <div
      role={reorderMode && onReorderTap ? 'presentation' : undefined}
      className={cn(
        'flex min-h-[48px] flex-col gap-2 rounded-xl border border-zinc-100 bg-white p-2 sm:flex-row sm:items-center sm:gap-3',
        reorderMode && picked && 'border-amber-300 bg-amber-50/90',
        reorderMode && onReorderTap && 'cursor-pointer touch-manipulation active:bg-zinc-50'
      )}
      onClick={
        reorderMode && onReorderTap
          ? (e) => {
              if ((e.target as HTMLElement).closest('button')) return
              onReorderTap(row.articulo_id)
            }
          : undefined
      }
    >
      {reorderMode ? (
        <GripVertical className="hidden h-5 w-5 shrink-0 text-amber-800 sm:block" aria-hidden />
      ) : null}

      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-bold text-zinc-900" title={name}>
          {name}
        </p>
        {isMenuPrice ? (
          <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-[#36606F]">
            <Star className="h-3 w-3 fill-[#36606F]" aria-hidden />
            {tPlatoMarbellaUi(lang).staffMarkMenuPrice}
          </span>
        ) : null}
      </div>

      {!reorderMode && onSlotChange ? (
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          {PLATO_MARBELLA_SLOTS.map((slot) => (
            <button
              key={slot}
              type="button"
              disabled={saving || isMenuPrice}
              onClick={() => void onSlotChange(row.articulo_id, slot, false)}
              className={cn(
                'min-h-[48px] min-w-[48px] rounded-lg px-2 text-[10px] font-black uppercase tracking-wide',
                currentSlot === slot && !isMenuPrice
                  ? 'bg-[#36606F] text-white'
                  : 'bg-zinc-100 text-zinc-700 active:bg-zinc-200'
              )}
            >
              {slotShortLabel(lang, slot)}
            </button>
          ))}
          <button
            type="button"
            disabled={saving}
            onClick={() => void onSlotChange(row.articulo_id, null, true)}
            className={cn(
              'min-h-[48px] rounded-lg px-2.5 text-[10px] font-black uppercase tracking-wide',
              isMenuPrice
                ? 'bg-[#36606F] text-white'
                : 'border border-[#36606F]/30 bg-[#36606F]/5 text-[#36606F] active:bg-[#36606F]/10'
            )}
          >
            €
          </button>
        </div>
      ) : null}

      <div className="flex shrink-0 items-center gap-1">
        {saving ? (
          <Loader2 className="h-5 w-5 animate-spin text-[#36606F]" aria-hidden />
        ) : null}
        {!reorderMode && onToggleVisible ? (
          <button
            type="button"
            className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-lg active:bg-zinc-50"
            aria-label={isActive ? 'Ocultar en carta' : 'Mostrar en carta'}
            onClick={() => onToggleVisible(row.articulo_id)}
          >
            {toggleBusy ? (
              <Loader2 className="h-5 w-5 animate-spin text-[#36606F]" />
            ) : isActive ? (
              <Check className="h-6 w-6 text-emerald-500" strokeWidth={3} />
            ) : (
              <Circle className="h-6 w-6 text-zinc-300" strokeWidth={2.5} />
            )}
          </button>
        ) : null}
        {!reorderMode && onEditProduct ? (
          <button
            type="button"
            className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-lg text-[#36606F] active:bg-zinc-50"
            aria-label={tPlatoMarbellaUi(lang).staffEditItem}
            onClick={() => onEditProduct(row.articulo_id)}
          >
            <Pencil className="h-5 w-5" strokeWidth={2.5} />
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function PlatoMarbellaStaffEditor({
  rows,
  lang,
  reorderMode = false,
  reorderSection = 'entrante',
  reorderPick,
  onReorderTap,
  orderedIds,
  onEditProduct,
  onSlotChange,
  onToggleVisible,
  toggleBusyId,
  savingSlotId,
}: {
  rows: StaffRow[]
  lang: CartaLang
  reorderMode?: boolean
  reorderSection?: PlatoMarbellaReorderSection
  reorderPick?: string | null
  onReorderTap?: (articuloId: number) => void
  /** En modo reordenar: orden visual de ids del tramo activo */
  orderedIds?: number[] | null
  onEditProduct?: (articuloId: number) => void
  onSlotChange?: (
    articuloId: number,
    slot: PlatoMarbellaSlot | null,
    isMenuPrice: boolean
  ) => void | Promise<void>
  onToggleVisible?: (articuloId: number) => void
  toggleBusyId?: number | null
  savingSlotId?: number | null
}) {
  const ui = tPlatoMarbellaUi(lang)
  const slotLabels = platoMarbellaSlotsForLang(lang)
  const grouped = groupPlatoMarbellaItems(rows)

  const rowById = useMemo(() => new Map(rows.map((r) => [r.articulo_id, r])), [rows])

  const sectionRows = useMemo(() => {
    if (!reorderMode || !orderedIds?.length) {
      if (reorderSection === 'unassigned') return grouped.unassigned as StaffRow[]
      return grouped.sections[reorderSection] as StaffRow[]
    }
    const out: StaffRow[] = []
    for (const id of orderedIds) {
      const r = rowById.get(id)
      if (r) out.push(r as StaffRow)
    }
    return out
  }, [reorderMode, orderedIds, reorderSection, grouped, rowById])

  if (reorderMode) {
    return (
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 py-2 custom-scrollbar sm:px-3">
        <p className="text-center text-[11px] font-black uppercase tracking-wide text-[#36606F]">
          {reorderSection === 'unassigned'
            ? ui.unassigned
            : slotLabels[reorderSection]}
        </p>
        {sectionRows.map((row) => (
          <StaffItemRow
            key={row.articulo_id}
            row={row}
            lang={lang}
            reorderMode
            reorderPick={reorderPick}
            onReorderTap={onReorderTap}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2 py-2 custom-scrollbar sm:px-3 sm:py-3">
      <p className="text-center text-xs font-semibold text-zinc-600">{ui.staffEditHint}</p>
      <p className="text-center text-2xl font-black tabular-nums text-[#36606F]">
        {formatMenuPrice(grouped.menuPrice)}
      </p>

      {grouped.priceOnlyRows.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-center text-[11px] font-black uppercase tracking-wide text-[#36606F]">
            {ui.staffMenuPriceSection}
          </h3>
          {grouped.priceOnlyRows.map((row) => (
            <StaffItemRow
              key={row.articulo_id}
              row={row as StaffRow}
              lang={lang}
              onEditProduct={onEditProduct}
              onSlotChange={onSlotChange}
              onToggleVisible={onToggleVisible}
              toggleBusyId={toggleBusyId}
              savingSlotId={savingSlotId}
            />
          ))}
        </section>
      ) : null}

      {PLATO_MARBELLA_SLOTS.map((slot) => {
        const list = grouped.sections[slot]
        if (list.length === 0) return null
        return (
          <section key={slot} className="space-y-2">
            <h3 className="text-center text-xs font-black uppercase tracking-[0.14em] text-[#36606F]">
              {slotLabels[slot]}
            </h3>
            {list.map((row) => (
              <StaffItemRow
                key={row.articulo_id}
                row={row as StaffRow}
                lang={lang}
                onEditProduct={onEditProduct}
                onSlotChange={onSlotChange}
                onToggleVisible={onToggleVisible}
                toggleBusyId={toggleBusyId}
                savingSlotId={savingSlotId}
              />
            ))}
          </section>
        )
      })}

      {grouped.unassigned.length > 0 ? (
        <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/80 p-2">
          <h3 className="text-center text-xs font-black uppercase tracking-wide text-amber-900">
            {ui.unassigned}
          </h3>
          <p className="text-center text-[11px] font-semibold text-amber-800">{ui.unassignedHint}</p>
          {grouped.unassigned.map((row) => (
            <StaffItemRow
              key={row.articulo_id}
              row={row as StaffRow}
              lang={lang}
              onEditProduct={onEditProduct}
              onSlotChange={onSlotChange}
              onToggleVisible={onToggleVisible}
              toggleBusyId={toggleBusyId}
              savingSlotId={savingSlotId}
            />
          ))}
        </section>
      ) : null}
    </div>
  )
}
