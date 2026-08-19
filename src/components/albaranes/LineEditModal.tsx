'use client'

import { cn } from '@/lib/utils'
import type { PurchaseInvoiceLine } from '@/app/dashboard/albaranes/actions'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'

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
  const displayName = line?.ingredient_name?.trim() || line?.original_name?.trim() || 'Sin nombre'
  const linkedName =
    line?.ingredient_name && line?.original_name && line.ingredient_name !== line.original_name
      ? line.original_name
      : null

  const subtitle = linkedName ? `${displayName} · En albarán: ${linkedName}` : displayName

  return (
    <Modal
      open={open && !!line && !!draft}
      onClose={onClose}
      variant="standard"
      layer="derived"
      instance="albaran-line-edit"
      parentInstance="albaran-detail"
      usageId="albaran-line-edit"
      usageLabel="Editar línea albarán"
      headerTone="petroleum"
      headerTitleAlign="left"
      title="Editar línea"
      subtitle={subtitle}
      className="bg-zinc-50"
      footer={
        <Button
          type="button"
          variant="tertiary"
          instance="albaran-line-edit-close"
          onClick={onClose}
          disabled={saving}
        >
          Cerrar
        </Button>
      }
    >
      {draft ? (
        <div className="px-3 py-3 flex flex-col gap-2 min-w-0 max-w-full">
          <section className="rounded-lg border border-zinc-200 bg-white p-2 space-y-2">
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400 px-1">Datos del albarán</p>
            <label className="block space-y-0.5 px-1">
              <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Nombre en factura</span>
              <input
                value={draft.original_name}
                onChange={(e) => onDraftChange({ original_name: e.target.value })}
                className="w-full min-h-12 px-2 rounded-lg border border-zinc-200 bg-white text-xs font-medium text-zinc-900 outline-none focus:border-[#36606F]/50"
                placeholder="Nombre línea"
              />
            </label>
            <div className="grid grid-cols-3 gap-1.5 px-1">
              <label className="min-w-0 block">
                <span
                  className="text-[9px] font-black uppercase tracking-wider text-zinc-400"
                  title="Si el PU es €/kg, indica los kg totales de la línea."
                >
                  Cant.
                </span>
                <input
                  inputMode="decimal"
                  value={draft.quantity}
                  onChange={(e) => onDraftChange({ quantity: e.target.value })}
                  className="mt-0.5 w-full min-h-12 px-2 rounded-lg border border-zinc-200 bg-white text-[11px] font-normal text-zinc-800 tabular-nums outline-none focus:border-[#36606F]/50"
                  placeholder=" "
                />
              </label>
              <label className="min-w-0 block">
                <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400">PU</span>
                <input
                  inputMode="decimal"
                  value={draft.unit_price}
                  onChange={(e) => onDraftChange({ unit_price: e.target.value })}
                  className="mt-0.5 w-full min-h-12 px-2 rounded-lg border border-zinc-200 bg-white text-[11px] font-normal text-zinc-800 tabular-nums outline-none focus:border-[#36606F]/50"
                  placeholder=" "
                />
              </label>
              <label className="min-w-0 block">
                <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Total</span>
                <input
                  inputMode="decimal"
                  value={draft.total_price}
                  onChange={(e) => onDraftChange({ total_price: e.target.value })}
                  className="mt-0.5 w-full min-h-12 px-2 rounded-lg border border-zinc-200 bg-white text-[11px] font-normal text-zinc-800 tabular-nums outline-none focus:border-[#36606F]/50"
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
                  'w-full min-h-12 rounded-lg bg-[#36606F] text-white text-[10px] font-semibold uppercase tracking-wider',
                  saving && 'opacity-60 pointer-events-none'
                )}
              >
                {saving ? 'Guardando…' : 'Guardar línea'}
              </button>
            ) : null}
          </section>
        </div>
      ) : null}
    </Modal>
  )
}
