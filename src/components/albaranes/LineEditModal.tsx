'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link2, Loader2, MinusCircle, Plus, Settings, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isInvoiceLineExcluded, isInvoiceLineExpenseOnly } from '@/lib/albaranes-line-status'
import type { PurchaseInvoiceLine } from '@/app/dashboard/albaranes/actions'
import { useScrollLock } from '@/hooks/useScrollLock'
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking'

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
  invoiceId: string | null
  supplierId: number | null
  portalTarget?: HTMLElement | null
  isManager: boolean
  stockApplied: boolean
  needsRepair: boolean
  saving: boolean
  busy: boolean
  isDirty: boolean
  onClose: () => void
  onDraftChange: (patch: Partial<LineEditDraft>) => void
  onSaveLine: () => void | Promise<void>
  onOpenMapping: () => void
  onOpenWizardNew: () => void
  onOpenWizardPrice: () => void
  onRectifyStock: () => void
  onEditMapping: () => void
  onRemoveMapping: () => void
  onRepairStock: () => void
  onExcludeFromMapping: () => void
  onRestoreFromExcluded: () => void
  onMarkExpenseOnly: () => void
  onRestoreFromExpenseOnly: () => void
}

function formatMaybeMoney(v: number | null | undefined) {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : null
  if (n == null || n === 0) return ' '
  return `${n.toFixed(2)}€`
}

export function LineEditModal({
  open,
  line,
  draft,
  supplierId,
  portalTarget,
  isManager,
  stockApplied,
  needsRepair,
  saving,
  busy,
  isDirty,
  onClose,
  onDraftChange,
  onSaveLine,
  onOpenMapping,
  onOpenWizardNew,
  onOpenWizardPrice,
  onRectifyStock,
  onEditMapping,
  onRemoveMapping,
  onRepairStock,
  onExcludeFromMapping,
  onRestoreFromExcluded,
  onMarkExpenseOnly,
  onRestoreFromExpenseOnly,
}: LineEditModalProps) {
  useModalUsageTracking({ open, usageId: 'albaran-line-edit', usageLabel: 'Editar línea albarán' })
  useScrollLock(open)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!open || !line || !draft || !mounted) return null

  const target = portalTarget ?? (typeof document !== 'undefined' ? document.body : null)
  if (!target) return null

  const displayName = line.ingredient_name?.trim() || line.original_name?.trim() || 'Sin nombre'
  const excluded = isInvoiceLineExcluded(line)
  const expenseOnly = isInvoiceLineExpenseOnly(line)
  const linkedName =
    line.ingredient_name && line.original_name && line.ingredient_name !== line.original_name
      ? line.original_name
      : null

  return createPortal(
    <div
      className="fixed inset-0 z-[10200] flex flex-col justify-end sm:justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="line-edit-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving && !busy) onClose()
      }}
    >
      <div
        className="flex flex-col w-full sm:max-w-lg sm:mx-auto max-h-[92vh] sm:max-h-[88vh] bg-zinc-50 sm:rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
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
            disabled={saving || busy}
            className="min-h-12 min-w-12 shrink-0 inline-flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 active:scale-[0.99] transition"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
          {isManager ? (
            <>
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
                    disabled={saving || busy}
                    className={cn(
                      'w-full min-h-12 rounded-xl bg-[#36606F] text-white text-xs font-black uppercase tracking-wider',
                      (saving || busy) && 'opacity-60 pointer-events-none'
                    )}
                  >
                    {saving ? 'Guardando…' : 'Guardar línea'}
                  </button>
                ) : null}
              </section>

              <section className="rounded-xl border border-[#36606F]/20 bg-[#36606F]/[0.06] p-4 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-[#36606F]">Almacén</p>
                {excluded ? (
                  <>
                    <p className="text-sm font-bold text-zinc-700">
                      Marcada como <span className="text-[#36606F]">portes / ajuste / sin cargo</span>
                    </p>
                    <p className="text-xs font-medium text-zinc-600 leading-snug">
                      No requiere vínculo con ingrediente ni entrada de stock. Cuenta como resuelta en el albarán.
                    </p>
                    <button
                      type="button"
                      onClick={() => void onRestoreFromExcluded()}
                      disabled={busy}
                      className={cn(
                        'w-full min-h-12 rounded-xl border border-zinc-200 bg-white text-xs font-black uppercase tracking-wide text-zinc-700',
                        busy && 'opacity-60 pointer-events-none'
                      )}
                    >
                      Volver a mapear
                    </button>
                  </>
                ) : expenseOnly ? (
                  <>
                    <p className="text-sm font-bold text-zinc-700">
                      Marcada como <span className="text-[#36606F]">gasto (sin stock)</span>
                    </p>
                    <p className="text-xs font-medium text-zinc-600 leading-snug">
                      Cuenta como gasto del albarán, pero no genera entrada de stock ni requiere ingrediente.
                    </p>
                    <button
                      type="button"
                      onClick={() => void onRestoreFromExpenseOnly()}
                      disabled={busy}
                      className={cn(
                        'w-full min-h-12 rounded-xl border border-zinc-200 bg-white text-xs font-black uppercase tracking-wide text-zinc-700',
                        busy && 'opacity-60 pointer-events-none'
                      )}
                    >
                      Volver a mapear
                    </button>
                  </>
                ) : line.ingredient_name ? (
                  <p className="text-sm font-bold text-zinc-800">
                    Vinculado: <span className="text-[#36606F]">{line.ingredient_name}</span>
                  </p>
                ) : (
                  <>
                    <p className="text-sm font-bold text-rose-700">Sin vínculo con catálogo</p>
                    <p className="text-xs font-medium text-zinc-600 leading-snug">
                      Elige el producto de almacén que corresponde a esta línea. Si cobráis por unidad
                      (croissants, botes sueltos…), suele bastar con buscar el nombre y confirmar.
                    </p>
                  </>
                )}
                {!excluded && !expenseOnly ? (
                  <>
                    <button
                      type="button"
                      onClick={onOpenMapping}
                      disabled={busy || supplierId == null}
                      className={cn(
                        'w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-[#36606F] text-white text-xs font-black uppercase tracking-wide',
                        (busy || supplierId == null) && 'opacity-50 pointer-events-none'
                      )}
                    >
                      <Link2 className="h-4 w-4" />
                      {line.ingredient_id ? 'Ajustar vínculo' : 'Vincular producto'}
                    </button>
                    {supplierId == null ? (
                      <p className="text-[11px] font-bold text-rose-700">Asigna proveedor al albarán antes de vincular.</p>
                    ) : null}
                    {!line.ingredient_id ? (
                      <button
                        type="button"
                        onClick={() => void onExcludeFromMapping()}
                        disabled={busy}
                        className={cn(
                          'w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-zinc-100 text-zinc-700 text-xs font-black uppercase tracking-wide',
                          busy && 'opacity-60 pointer-events-none'
                        )}
                      >
                        <MinusCircle className="h-4 w-4" />
                        Portes / ajuste / sin cargo
                      </button>
                    ) : null}

                    {!line.ingredient_id ? (
                      <button
                        type="button"
                        onClick={() => void onMarkExpenseOnly()}
                        disabled={busy}
                        className={cn(
                          'w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white text-zinc-700 text-xs font-black uppercase tracking-wide',
                          busy && 'opacity-60 pointer-events-none'
                        )}
                      >
                        <MinusCircle className="h-4 w-4" />
                        Gasto (sin stock)
                      </button>
                    ) : null}
                  </>
                ) : null}
              </section>

              {needsRepair && !excluded ? (
                <button
                  type="button"
                  onClick={() => void onRepairStock()}
                  disabled={busy}
                  className={cn(
                    'w-full min-h-12 rounded-xl bg-amber-500 text-white text-xs font-black uppercase tracking-wide',
                    busy && 'opacity-60 pointer-events-none'
                  )}
                >
                  Aplicar stock pendiente
                </button>
              ) : null}

              {!excluded ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onOpenWizardNew}
                  className="min-h-12 flex-1 min-w-[8rem] inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-2 text-[10px] font-bold uppercase text-zinc-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Nuevo
                </button>
                <button
                  type="button"
                  onClick={onOpenWizardPrice}
                  disabled={!line.ingredient_id}
                  className={cn(
                    'min-h-12 flex-1 min-w-[8rem] inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-2 text-[10px] font-bold uppercase text-[#36606F]',
                    !line.ingredient_id && 'opacity-45 pointer-events-none'
                  )}
                >
                  <Settings className="h-3.5 w-3.5" />
                  Precio
                </button>
                {stockApplied ? (
                  <button
                    type="button"
                    onClick={() => void onRectifyStock()}
                    disabled={busy}
                    className={cn(
                      'min-h-12 flex-1 min-w-[8rem] rounded-xl border border-amber-200 bg-amber-50 text-[10px] font-bold uppercase text-amber-800',
                      busy && 'opacity-60 pointer-events-none'
                    )}
                  >
                    Rectificar stock
                  </button>
                ) : null}
                {line.ingredient_id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void onEditMapping()}
                      disabled={busy}
                      className={cn(
                        'min-h-12 flex-1 min-w-[8rem] rounded-xl border border-zinc-200 bg-white text-[10px] font-bold uppercase text-zinc-700',
                        busy && 'opacity-60 pointer-events-none'
                      )}
                    >
                      Editar match
                    </button>
                    <button
                      type="button"
                      onClick={() => void onRemoveMapping()}
                      disabled={busy}
                      className={cn(
                        'min-h-12 flex-1 min-w-[8rem] rounded-xl border border-rose-200 bg-rose-50 text-[10px] font-bold uppercase text-rose-700',
                        busy && 'opacity-60 pointer-events-none'
                      )}
                    >
                      Eliminar match
                    </button>
                  </>
                ) : null}
              </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-xl border border-zinc-100 bg-white p-4 space-y-2 text-sm">
              <p>
                <span className="font-black text-zinc-500">Nombre:</span> {line.original_name || '—'}
              </p>
              <p>
                <span className="font-black text-zinc-500">Cant.:</span>{' '}
                {line.quantity == null ? ' ' : String(line.quantity)}
              </p>
              <p>
                <span className="font-black text-zinc-500">PU:</span> {formatMaybeMoney(line.unit_price)}
              </p>
              <p>
                <span className="font-black text-zinc-500">Total:</span> {formatMaybeMoney(line.total_price)}
              </p>
              {line.ingredient_name ? (
                <p>
                  <span className="font-black text-zinc-500">Catálogo:</span> {line.ingredient_name}
                </p>
              ) : isInvoiceLineExcluded(line) ? (
                <p>
                  <span className="font-black text-zinc-500">Tipo:</span> Portes / ajuste / sin cargo
                </p>
              ) : null}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-zinc-200 bg-white p-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving || busy}
            className="w-full min-h-12 rounded-xl border border-zinc-200 bg-white text-sm font-black uppercase tracking-wide text-zinc-700 hover:bg-zinc-50"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    target
  )
}
