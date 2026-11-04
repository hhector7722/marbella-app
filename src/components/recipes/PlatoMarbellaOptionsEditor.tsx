'use client'

import { useMemo, useState } from 'react'
import { ArrowRightLeft, Check, ChevronDown, Eye, EyeOff, Pencil, Plus, Search, Trash2, UtensilsCrossed, X } from 'lucide-react'
import { toast } from 'sonner'
import { upsertMenuOverride } from '@/app/dashboard/carta/actions'
import { PLATO_MARBELLA_SLOTS, type PlatoMarbellaSlot } from '@/lib/carta-plato-marbella'
import { eligiblePlatoMarbellaOptions, type MarbellaEditorOption } from '@/lib/plato-marbella-editor-options'
import { cn } from '@/lib/utils'

const slotNames: Record<PlatoMarbellaSlot, string> = {
  entrante: 'Entrantes',
  principal: 'Principales',
  guarnicion: 'Guarniciones',
}

const normalize = (value: string) =>
  value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es')
const title = (item: MarbellaEditorOption) => item.recipe_name || item.carta_nombre
const itemCount = (rows: MarbellaEditorOption[], slot: PlatoMarbellaSlot) =>
  rows.filter((item) => item.plato_marbella_slot === slot && !item.is_hidden).length

function RecipeThumbnail({ item }: { item: MarbellaEditorOption }) {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#36606F]/[0.06]">
      {item.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- Fotos ya alojadas en Supabase.
        <img src={item.photo_url} alt="" className="h-full w-full object-cover" />
      ) : (
        <UtensilsCrossed size={18} className="text-[#36606F]/50" aria-hidden="true" />
      )}
    </div>
  )
}

export function PlatoMarbellaOptionsEditor({
  rows,
  categoryId,
  busy,
  error,
  onUpdated,
}: {
  rows: MarbellaEditorOption[]
  categoryId: string | null
  busy: boolean
  error: string | null
  onUpdated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState<number | null>(null)
  const [moving, setMoving] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [showAllCandidates, setShowAllCandidates] = useState(false)

  const assigned = useMemo(
    () => rows.filter((item) =>
      !item.plato_marbella_is_menu_price &&
      item.plato_marbella_slot !== null &&
      PLATO_MARBELLA_SLOTS.includes(item.plato_marbella_slot)
    ), [rows]
  )
  const allCandidates = useMemo(() =>
    eligiblePlatoMarbellaOptions(rows).filter((item) =>
      normalize(title(item) + ' ' + item.carta_nombre + ' ' + item.articulo_nombre)
        .includes(normalize(search.trim()))
    ), [rows, search])
  const candidates = search.trim() || showAllCandidates ? allCandidates : allCandidates.slice(0, 7)
  const blocked = busy || saving !== null || !categoryId || Boolean(error)

  const changeSlot = async (item: MarbellaEditorOption, next: PlatoMarbellaSlot | null) => {
    if (blocked) return
    const previous = item.plato_marbella_slot
    if (previous && previous !== next && !item.is_hidden && itemCount(assigned, previous) <= 1) {
      toast.error('Debe quedar al menos una opción visible en cada grupo')
      return
    }

    setSaving(item.articulo_id)
    try {
      const result = await upsertMenuOverride({
        articulo_id: item.articulo_id,
        plato_marbella_slot: next,
        plato_marbella_is_menu_price: false,
        // Al activar una opción oculta pasa a mostrarse también en la carta.
        // Si se retira, se oculta para no dejarla suelta dentro de Plato Marbella.
        is_hidden: next === null,
        ...(next ? { category_id: categoryId! } : {}),
      })
      if (!result.success) throw new Error(result.error || 'No se pudo guardar el cambio')
      setMoving(null)
      setSearch('')
      setShowAllCandidates(false)
      toast.success(next ? 'Opción añadida al Plato Marbella' : 'Opción retirada del Plato Marbella')
      onUpdated()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo guardar el cambio')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="border-b border-zinc-100 pb-4">
      <button
        type="button"
        onClick={() => { setOpen((current) => !current); setMoving(null) }}
        aria-expanded={open}
        className={cn(
          'flex min-h-10 w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
          open ? 'border-[#36606F]/30 bg-[#36606F]/[0.05]' : 'border-zinc-200 bg-white hover:bg-zinc-50',
        )}
      >
        <span className="flex items-center gap-2.5 text-sm font-semibold text-[#36606F]">
          {open ? <X size={16} aria-hidden="true" /> : <Pencil size={16} aria-hidden="true" />}
          {open ? 'Cerrar editor de platos' : 'Editar las opciones del plato'}
        </span>
        <ChevronDown size={17} className={cn('shrink-0 text-[#36606F] transition-transform', open && 'rotate-180')} />
      </button>

      {open ? (
        <div className="mt-4 space-y-4">
          {error ? (
            <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              No se pudieron cargar las recetas para editar: {error}
            </p>
          ) : null}
          <p className="text-xs leading-relaxed text-zinc-500">
            Gestiona los platos de cada grupo. Las opciones activas se reflejan en la carta y en el cálculo de costes.
          </p>

          <div className="grid gap-3 lg:grid-cols-3">
            {PLATO_MARBELLA_SLOTS.map((slot) => {
              const items = assigned.filter((item) => item.plato_marbella_slot === slot)
              const active = items.filter((item) => !item.is_hidden).length
              return (
                <section key={slot} className="min-w-0 rounded-2xl border border-zinc-200 bg-zinc-50/50 p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-zinc-800">{slotNames[slot]}</h3>
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold tabular-nums text-[#36606F]">
                      {active}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {items.map((item) => (
                      <div key={item.articulo_id} className="min-w-0 rounded-xl border border-zinc-200/80 bg-white p-2.5">
                        <div className="flex min-w-0 items-center gap-2">
                          <RecipeThumbnail item={item} />
                          <div className="min-w-0 flex-1">
                            <div className="break-words text-xs font-semibold leading-snug text-zinc-800">{title(item)}</div>
                            {item.is_hidden ? (
                              <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
                                <EyeOff size={12} /> Oculta en la carta
                              </span>
                            ) : null}
                          </div>
                          {item.is_hidden ? (
                            <button
                              type="button"
                              disabled={blocked}
                              onClick={() => void changeSlot(item, slot)}
                              aria-label={'Activar ' + title(item)}
                              className="shrink-0 rounded-lg bg-[#36606F]/10 p-2 text-[#36606F] transition-colors hover:bg-[#36606F]/20 disabled:opacity-50"
                              title="Activar en la carta"
                            >
                              <Eye size={17} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={blocked}
                              onClick={() => setMoving((current) => current === item.articulo_id ? null : item.articulo_id)}
                              aria-label={'Mover o quitar ' + title(item)}
                              aria-expanded={moving === item.articulo_id}
                              className="shrink-0 rounded-lg border border-zinc-200 p-2 text-zinc-600 transition-colors hover:border-[#36606F]/40 hover:text-[#36606F] disabled:opacity-50"
                              title="Mover o quitar"
                            >
                              <ArrowRightLeft size={16} />
                            </button>
                          )}
                        </div>
                        {moving === item.articulo_id ? (
                          <div className="mt-2 space-y-1.5 border-t border-zinc-100 pt-2">
                            <div className="text-[11px] font-medium text-zinc-500">Mover a otro grupo</div>
                            <div className="flex flex-wrap gap-1.5">
                              {PLATO_MARBELLA_SLOTS.filter((other) => other !== slot).map((other) => (
                                <button
                                  type="button"
                                  key={other}
                                  disabled={blocked}
                                  onClick={() => void changeSlot(item, other)}
                                  className="min-h-8 rounded-lg border border-zinc-200 px-2 text-[11px] font-semibold text-zinc-700 hover:border-[#36606F]/40 disabled:opacity-50"
                                >
                                  {slotNames[other]}
                                </button>
                              ))}
                              <button
                                type="button"
                                disabled={blocked}
                                onClick={() => void changeSlot(item, null)}
                                className="flex min-h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                              >
                                <Trash2 size={13} /> Quitar
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ))}
                    {items.length === 0 ? (
                      <p className="px-2 py-3 text-center text-xs text-zinc-400">Sin opciones</p>
                    ) : null}
                  </div>
                </section>
              )
            })}
          </div>

          <section className="rounded-2xl border border-zinc-200 bg-white p-3 sm:p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#36606F]/10 text-[#36606F]">
                <Plus size={18} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-zinc-800">Añadir receta</h3>
                <p className="text-[11px] text-zinc-500">Busca por nombre y elige en qué grupo incluirla</p>
              </div>
            </div>

            <label className="flex min-h-11 items-center gap-2.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3 focus-within:border-[#36606F]/60">
              <Search size={17} className="shrink-0 text-zinc-400" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => { setSearch(event.target.value); setShowAllCandidates(false) }}
                placeholder="Buscar Crema, pasta, verduras…"
                aria-label="Buscar receta para añadir"
                className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-zinc-800 outline-none placeholder:text-zinc-400"
              />
              {search ? (
                <button
                  type="button"
                  aria-label="Borrar búsqueda"
                  onClick={() => setSearch('')}
                  className="rounded-full p-1 text-zinc-400 hover:bg-zinc-200"
                >
                  <X size={15} />
                </button>
              ) : null}
            </label>

            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
              {candidates.map((item) => (
                <div key={item.articulo_id} className="rounded-xl border border-zinc-200/80 p-3 transition-colors hover:border-[#36606F]/25">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <RecipeThumbnail item={item} />
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-sm font-semibold leading-snug text-zinc-800">{title(item)}</div>
                      <p className="mt-0.5 text-[11px] text-zinc-500">{item.articulo_nombre}</p>
                      {item.is_hidden ? (
                        <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                          <EyeOff size={12} /> Oculta en la carta
                          {item.plato_marbella_slot ? ' · ya asignada' : ''}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {PLATO_MARBELLA_SLOTS.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        disabled={blocked}
                        onClick={() => void changeSlot(item, slot)}
                        aria-label={(item.is_hidden && item.plato_marbella_slot === slot ? 'Activar en ' : 'Añadir a ') + slotNames[slot] + ': ' + title(item)}
                        className={cn(
                          'flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold transition-colors disabled:opacity-50',
                          item.is_hidden && item.plato_marbella_slot === slot
                            ? 'border-[#36606F]/25 bg-[#36606F]/10 text-[#36606F]'
                            : 'border-zinc-200 text-zinc-700 hover:border-[#36606F]/50 hover:bg-[#36606F]/[0.04]',
                        )}
                      >
                        {item.is_hidden && item.plato_marbella_slot === slot ? <Check size={13} /> : <Plus size={13} />}
                        {item.is_hidden && item.plato_marbella_slot === slot ? 'Activar en ' + slotNames[slot] : slotNames[slot]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {candidates.length === 0 ? (
                <p className="rounded-xl bg-zinc-50 px-3 py-6 text-center text-xs text-zinc-500">
                  No hay recetas disponibles con ese nombre.
                </p>
              ) : null}
            </div>

            {!search.trim() && !showAllCandidates && allCandidates.length > candidates.length ? (
              <button
                type="button"
                onClick={() => setShowAllCandidates(true)}
                className="mt-2 flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg text-xs font-semibold text-[#36606F] hover:bg-zinc-50"
              >
                Ver las {allCandidates.length} recetas disponibles <ChevronDown size={15} />
              </button>
            ) : null}
            <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
              Se utilizan las recetas vendibles vinculadas al TPV. Si una estaba oculta,
              se activará en la carta al añadirla. La elaboración de producción no se duplica.
            </p>
          </section>
        </div>
      ) : null}
    </div>
  )
}
