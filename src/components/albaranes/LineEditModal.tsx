'use client'

import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PurchaseInvoiceLine } from '@/app/dashboard/albaranes/actions'
import { Modal } from '@/components/ui/modal'

/** Por encima del detalle de albarán (z-[10050]); una sola superficie derivada a la vez. */
const ALBARAN_DERIVED_MODAL_Z = 'z-[10100]'

export type LineEditDraft = {
  original_name: string
  quantity: string
  unit_price: string
  total_price: string
}

export type LineEditModalProps = {
  open: boolean
  line: PurchaseInvoiceLine | null
  draft: LineEditDraft | null
  saving: boolean
  isDirty: boolean
  onClose: () => void
  onDraftChange: (patch: Partial<LineEditDraft>) => void
  onSaveLine: () => void | Promise<void>
}

export function LineEditModal({
  open,
  line,
  draft,
  saving,
  isDirty,
  onClose,
  onDraftChange,
  onSaveLine,
}: LineEditModalProps) {
  if (!open || !line || !draft) return null

  const displayName = line.ingredient_name?.trim() || line.original_name?.trim() || 'Sin nombre'
  const linkedName =
    line.ingredient_name && line.original_name && line.ingredient_name !== line.original_name
      ? line.original_name
      : null

  return (
    <Modal
      open={open}
      onClose={onClose}
      hideHeader={true}
      wrapperClassName="sm:max-w-lg"
      panelHostClassName="p-0"
      className="max-h-[92vh] sm:max-h-[88vh] bg-zinc-50"
      zIndexClass={ALBARAN_DERIVED_MODAL_Z}
      usageId="albaran-line-edit"
      usageLabel="Editar línea albarán"
      title="Editar línea"
    >
      <div className="flex flex-col h-full w-full">
        <div className="bg-[#36606F] px-4 py-3 flex items-start justify-between gap-3 text-white shrink-0">
          <div className="min-w-0 flex-1">
            <p id="line-edit-title" className="text-xs font-black uppercase tracking-wider text-white/80">
              Editar línea
            </p>
            <p className="text-sm font-black truncate mt-0.5">{displayName}</p>
            {linkedName ? (
              <p className="text-[11px] font-semibold text-white/70 truncate mt-0.5">En albarán: {linkedName}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-12 min-w-12 shrink-0 inline-flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 active:scale-[0.99] transition"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
          <section className="rounded-xl border border-zinc-100 bg-white shadow-sm p-4 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Datos del albarán</p>
            <label className="block space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Nombre en factura</span>
              <input
                value={draft.original_name}
                onChange={(e) => onDraftChange({ original_name: e.target.value })}
                className="w-full min-h-12 px-3 rounded-xl border border-zinc-200 bg-white text-sm font-black text-zinc-900 outline-none focus:border-[#36606F]/50"
                placeholder="Nombre línea"
              />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="min-w-0 block">
                <span
                  className="text-[9px] font-black uppercase tracking-wider text-zinc-500"
                  title="Si el PU es €/kg, indica los kg totales de la línea."
                >
                  Cant.
                </span>
                <input
                  inputMode="decimal"
                  value={draft.quantity}
                  onChange={(e) => onDraftChange({ quantity: e.target.value })}
                  className="mt-0.5 w-full min-h-12 px-2 rounded-xl border border-zinc-200 bg-white text-sm font-bold text-zinc-800 outline-none focus:border-[#36606F]/50"
                  placeholder=" "
                />
              </label>
              <label className="min-w-0 block">
                <span className="text-[9px] font-black uppercase tracking-wider text-zinc-500">PU</span>
                <input
                  inputMode="decimal"
                  value={draft.unit_price}
                  onChange={(e) => onDraftChange({ unit_price: e.target.value })}
                  className="mt-0.5 w-full min-h-12 px-2 rounded-xl border border-zinc-200 bg-white text-sm font-bold text-zinc-800 outline-none focus:border-[#36606F]/50"
                  placeholder=" "
                />
              </label>
              <label className="min-w-0 block">
                <span className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Total</span>
                <input
                  inputMode="decimal"
                  value={draft.total_price}
                  onChange={(e) => onDraftChange({ total_price: e.target.value })}
                  className="mt-0.5 w-full min-h-12 px-2 rounded-xl border border-zinc-200 bg-white text-sm font-bold text-zinc-800 outline-none focus:border-[#36606F]/50"
                  placeholder=" "
                />
              </label>
            </div>
            {isDirty ? (
              <button
                type="button"
                onClick={() => void onSaveLine()}
                disabled={saving}
                className={cn(
                  'w-full min-h-12 rounded-xl bg-[#36606F] text-white text-xs font-black uppercase tracking-wider',
                  saving && 'opacity-60 pointer-events-none'
                )}
              >
                {saving ? 'Guardando…' : 'Guardar línea'}
              </button>
            ) : null}
          </section>
        </div>

        <div className="shrink-0 border-t border-zinc-200 bg-white p-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="w-full min-h-12 rounded-xl border border-zinc-200 bg-white text-sm font-black uppercase tracking-wide text-zinc-700 hover:bg-zinc-50"
          >
            Cerrar
          </button>
        </div>
      </div>
    </Modal>
  )
}
