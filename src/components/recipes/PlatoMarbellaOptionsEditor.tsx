'use client'

import { useMemo, useState } from 'react'
import { Pencil, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { upsertMenuOverride } from '@/app/dashboard/carta/actions'
import { PLATO_MARBELLA_SLOTS, platoMarbellaSlotsForLang, type PlatoMarbellaSlot } from '@/lib/carta-plato-marbella'
import type { PlatoMarbellaCostRow } from '@/lib/plato-marbella-escandallo'

export type EditableMarbellaOption = PlatoMarbellaCostRow & {
  category_child_id?: string | null
  category_parent_name?: string | null
}

const slots = platoMarbellaSlotsForLang('es')
const compare = (a: EditableMarbellaOption, b: EditableMarbellaOption) =>
  (a.recipe_name || a.carta_nombre || '').localeCompare(
    b.recipe_name || b.carta_nombre || '', 'es', { sensitivity: 'base' }
  )
const label = (row: EditableMarbellaOption) =>
  row.recipe_name?.trim() || row.carta_nombre?.trim() || 'Artículo ' + row.articulo_id
const normalized = (value: string) =>
  value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es')

/** Modifica el mismo tramo TPV que utilizan la carta y el escandallo; no copia recetas. */
export function PlatoMarbellaOptionsEditor({
  rows,
  categoryId,
  busy,
  onUpdated,
}: {
  rows: EditableMarbellaOption[]
  categoryId: string | null
  busy: boolean
  onUpdated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [candidateId, setCandidateId] = useState('')
  const [targetSlot, setTargetSlot] = useState<PlatoMarbellaSlot>('entrante')

  const assigned = useMemo(
    () => rows.filter((row) =>
      !row.plato_marbella_is_menu_price &&
      PLATO_MARBELLA_SLOTS.includes(row.plato_marbella_slot as PlatoMarbellaSlot)
    ), [rows]
  )

  const candidates = useMemo(() =>
    rows.filter((row) =>
      !row.plato_marbella_is_menu_price &&
      !row.plato_marbella_slot &&
      Boolean(row.recipe_id) &&
      normalized(label(row) + ' ' + (row.carta_nombre || '')).includes(normalized(search))
    ).sort(compare), [rows, search])

  const changeSlot = async (row: EditableMarbellaOption, next: PlatoMarbellaSlot | null) => {
    if (!categoryId || saving !== null || busy) return
    const previous = row.plato_marbella_slot
    if (previous && previous !== next &&
        assigned.filter((item) => item.plato_marbella_slot === previous).length <= 1) {
      toast.error('Debe quedar al menos una opción en cada grupo')
      return
    }
    setSaving(row.articulo_id)
    try {
      const response = await upsertMenuOverride({
        articulo_id: row.articulo_id,
        plato_marbella_slot: next,
        plato_marbella_is_menu_price: false,
        ...(next ? { category_id: categoryId } : {}),
      })
      if (!response.success) throw new Error(response.error ?? 'No se ha podido guardar la opción')
      toast.success('Opciones del Plato Marbella actualizadas')
      setCandidateId('')
      onUpdated()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo actualizar el Plato Marbella')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="border-b border-gray-100 pb-3">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
        className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
      >
        {open ? <X size={14} /> : <Pencil size={14} />}
        {open ? 'Cerrar edición' : 'Editar entrantes, principales y guarniciones'}
      </button>

      {open ? (
        <div className="mt-3 space-y-4">
          <p className="text-xs leading-relaxed text-zinc-500">
            Cambiar un grupo actualiza las opciones de la carta y recalcula el escandallo.
            Una opción sin asignar deja de ofrecerse en el Plato Marbella.
          </p>

          {PLATO_MARBELLA_SLOTS.map((slot) => (
            <div key={slot} className="rounded-xl border border-zinc-200 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-zinc-800">{slots[slot]}</h3>
                <span className="text-xs tabular-nums text-zinc-500">
                  {assigned.filter((row) => row.plato_marbella_slot === slot).length}
                </span>
              </div>
              <div className="space-y-2">
                {assigned.filter((row) => row.plato_marbella_slot === slot).sort(compare).map((row) => (
                  <div key={row.articulo_id} className="flex min-w-0 items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 text-xs font-medium text-zinc-700" title={row.carta_nombre ?? ''}>
                      {label(row)}
                    </span>
                    <select
                      value={slot}
                      aria-label={'Grupo de ' + label(row)}
                      disabled={saving !== null || !categoryId || busy}
                      onChange={(event) => {
                        const value = event.target.value
                        void changeSlot(row, value ? value as PlatoMarbellaSlot : null)
                      }}
                      className="min-h-9 max-w-[145px] shrink-0 rounded-lg border border-zinc-200 bg-white px-2 text-xs text-zinc-700 disabled:opacity-50"
                    >
                      <option value="entrante">Entrante</option>
                      <option value="principal">Principal</option>
                      <option value="guarnicion">Guarnición</option>
                      <option value="">Quitar del plato</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="rounded-xl border border-dashed border-zinc-300 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold text-zinc-800">
              <Plus size={15} /> Añadir opción
            </div>
            <input
              type="search"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setCandidateId('') }}
              placeholder="Buscar receta vinculada al TPV"
              aria-label="Buscar nueva opción del Plato Marbella"
              className="mb-2 min-h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-[#36606F]"
            />
            <select
              value={candidateId}
              onChange={(event) => setCandidateId(event.target.value)}
              aria-label="Receta para añadir al Plato Marbella"
              className="min-h-10 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs text-zinc-700"
            >
              <option value="">Seleccionar receta… ({candidates.length})</option>
              {candidates.map((row) => (
                <option key={row.articulo_id} value={row.articulo_id}>
                  {label(row)} · {row.carta_nombre ?? 'TPV'} · {row.articulo_id}
                </option>
              ))}
            </select>
            <div className="mt-2 flex items-center gap-2">
              <select
                value={targetSlot}
                onChange={(event) => setTargetSlot(event.target.value as PlatoMarbellaSlot)}
                aria-label="Grupo para la nueva opción"
                className="min-h-10 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2 text-xs"
              >
                {PLATO_MARBELLA_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>{slots[slot]}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!candidateId || !categoryId || saving !== null || busy}
                onClick={() => {
                  const row = candidates.find((item) => String(item.articulo_id) === candidateId)
                  if (row) void changeSlot(row, targetSlot)
                }}
                className="min-h-10 rounded-lg bg-[#36606F] px-4 text-xs font-bold text-white disabled:opacity-50"
              >
                Añadir
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
              Sólo artículos visibles del TPV con receta vinculada. Si pertenece a otra sección,
              al añadirlo se moverá a Plato Marbella en la carta.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
