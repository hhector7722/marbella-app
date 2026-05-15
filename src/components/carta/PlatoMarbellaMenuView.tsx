'use client'

import Image from 'next/image'
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
  type PlatoMarbellaMenuRow,
  type PlatoMarbellaSlot,
} from '@/lib/carta-plato-marbella'

const SLOT_ORDER: PlatoMarbellaSlot[] = ['entrante', 'principal', 'guarnicion']

function formatMenuPrice(precio: number | null) {
  if (precio == null || precio === 0) return ' '
  return `${precio.toFixed(2)}€`
}

function stepChipLabel(lang: CartaLang, slot: PlatoMarbellaSlot) {
  const ui = tPlatoMarbellaUi(lang)
  if (slot === 'entrante') return ui.stepEntrante
  if (slot === 'principal') return ui.stepPrincipal
  return ui.stepGuarnicion
}

type OptionRow = PlatoMarbellaMenuRow & CartaNameRow

function OptionCard({
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
    <div className="flex w-[42vw] max-w-[9.5rem] shrink-0 flex-col overflow-hidden rounded-2xl bg-white sm:w-36">
      {photo ? (
        <button
          type="button"
          className="relative mx-auto aspect-[4/5] w-full min-h-[48px] shrink-0 touch-manipulation active:bg-zinc-50"
          aria-label="Ver foto ampliada"
          onClick={() => onPhotoClick?.(photo, name)}
        >
          <Image
            src={photo}
            alt=""
            fill
            sizes="42vw"
            className="pointer-events-none object-contain object-center p-1.5"
          />
        </button>
      ) : (
        <div className="relative mx-auto aspect-[4/5] w-full shrink-0 bg-zinc-50" aria-hidden />
      )}
      <p
        className="line-clamp-3 px-1.5 pb-2 pt-1 text-center text-[10px] font-bold leading-tight text-zinc-900 sm:text-[11px]"
        title={name}
      >
        {name}
      </p>
    </div>
  )
}

export function PlatoMarbellaMenuView({
  rows,
  lang,
  subTitle,
  showUnassigned = false,
  onPhotoClick,
  className,
}: {
  rows: OptionRow[]
  lang: CartaLang
  subTitle?: string
  showUnassigned?: boolean
  onPhotoClick?: (src: string, alt: string) => void
  className?: string
}) {
  const ui = tPlatoMarbellaUi(lang)
  const slotLabels = platoMarbellaSlotsForLang(lang)
  const grouped = groupPlatoMarbellaItems(rows)

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="shrink-0 space-y-2 border-b border-zinc-100 bg-white px-2 pb-3 pt-1 sm:px-3">
        {subTitle ? (
          <p className="text-center text-[11px] font-black uppercase tracking-[0.12em] text-[#36606F] sm:text-xs">
            {subTitle}
          </p>
        ) : null}
        <p className="text-center text-xs font-semibold leading-snug text-zinc-600 sm:text-sm">{ui.intro}</p>
        <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
          {SLOT_ORDER.map((slot) => (
            <span
              key={slot}
              className="rounded-full border border-[#36606F]/25 bg-[#36606F]/5 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#36606F] sm:text-[11px]"
            >
              {stepChipLabel(lang, slot)}
            </span>
          ))}
        </div>
        <p className="text-center text-2xl font-black tabular-nums text-[#36606F] sm:text-3xl">
          {formatMenuPrice(grouped.menuPrice)}
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-2 py-3 custom-scrollbar sm:space-y-6 sm:px-3 sm:py-4">
        {SLOT_ORDER.map((slot) => {
          const sectionRows = grouped.sections[slot]
          if (sectionRows.length === 0) return null
          return (
            <section key={slot} className="space-y-2">
              <h3 className="sticky top-0 z-10 bg-white/95 py-1 text-center text-xs font-black uppercase tracking-[0.14em] text-[#36606F] backdrop-blur-sm sm:text-sm">
                {slotLabels[slot]}
              </h3>
              <div className="flex gap-2 overflow-x-auto pb-1 overscroll-x-contain [-webkit-overflow-scrolling:touch]">
                {sectionRows.map((row) => (
                  <OptionCard key={row.articulo_id} row={row as OptionRow} lang={lang} onPhotoClick={onPhotoClick} />
                ))}
              </div>
            </section>
          )
        })}

        {showUnassigned && grouped.unassigned.length > 0 ? (
          <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/80 p-2">
            <h3 className="text-center text-xs font-black uppercase tracking-wide text-amber-900">{ui.unassigned}</h3>
            <p className="text-center text-[11px] font-semibold text-amber-800">{ui.unassignedHint}</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {grouped.unassigned.map((row) => (
                <OptionCard key={row.articulo_id} row={row as OptionRow} lang={lang} onPhotoClick={onPhotoClick} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
