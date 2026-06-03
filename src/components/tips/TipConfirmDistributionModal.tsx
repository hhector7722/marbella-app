'use client';

import { createPortal } from 'react-dom';
import { X, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatLocalIsoDateLabel } from '@/lib/tip-distribution-display';
import { useScrollLock } from '@/hooks/useScrollLock';

export type TipConfirmStaffRow = {
  id: string;
  name: string;
  totalAmount: number;
  weekdayAmount: number;
  weekendAmount: number;
  isSanctioned?: boolean;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  startDate: string;
  endDate: string;
  weekdayTotal: number;
  weekendTotal: number;
  staff: TipConfirmStaffRow[];
  confirming: boolean;
  onConfirm: () => void;
};

const fmtMoney = (val: number) => (Math.abs(val) < 0.005 ? ' ' : `${val.toFixed(2)} €`);

export function TipConfirmDistributionModal({
  isOpen,
  onClose,
  startDate,
  endDate,
  weekdayTotal,
  weekendTotal,
  staff,
  confirming,
  onConfirm,
}: Props) {
  useScrollLock(isOpen);
  if (!isOpen) return null;

  const grandTotal = weekdayTotal + weekendTotal;
  const staffWithPayout = staff.filter(
    (s) => Math.abs(s.totalAmount) > 0.005 && !s.isSanctioned
  );

  const modal = (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="z-[9999] flex max-h-[90vh] w-full max-w-[min(32rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#36606F] px-4 py-3 md:py-4 flex items-center justify-between text-white shrink-0">
          <h2 className="text-sm md:text-lg font-black uppercase tracking-wider">Confirmar reparto</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={confirming}
            className="w-11 h-11 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 min-h-[48px] min-w-[48px]"
            aria-label="Cerrar"
          >
            <X size={20} strokeWidth={3} />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-3 space-y-2 text-sm">
            <p className="font-black text-zinc-800">
              Período: {formatLocalIsoDateLabel(startDate, 'd MMM yyyy')} →{' '}
              {formatLocalIsoDateLabel(endDate, 'd MMM yyyy')}
            </p>
            <p className="text-zinc-600">
              Lun–Vie: <span className="font-black tabular-nums">{weekdayTotal.toFixed(2)} €</span>
            </p>
            <p className="text-zinc-600">
              Sáb–Dom: <span className="font-black tabular-nums">{weekendTotal.toFixed(2)} €</span>
            </p>
            <p className="text-emerald-700 font-black">
              Total botes: <span className="tabular-nums">{grandTotal.toFixed(2)} €</span>
            </p>
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">
              Empleados ({staffWithPayout.length})
            </p>
            <ul className="space-y-1.5 max-h-48 overflow-y-auto">
              {staffWithPayout.length === 0 ? (
                <li className="text-zinc-400 text-sm font-bold py-4 text-center">Sin importes a repartir</li>
              ) : (
                staffWithPayout.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-zinc-100 px-3 py-2 min-h-[44px]"
                  >
                    <span className="text-sm font-black text-zinc-800 truncate">
                      {(s.name || '').trim().split(/\s+/)[0] || s.name}
                    </span>
                    <span className="text-sm font-black tabular-nums text-emerald-600 shrink-0">
                      {fmtMoney(s.totalAmount)}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>

          <p className="text-[11px] text-zinc-500 font-bold leading-snug">
            Se guardará un snapshot en el historial. Los botes actuales no se modifican.
          </p>
        </div>

        <div className="p-3 border-t border-zinc-100 flex gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={confirming}
            className="flex-1 min-h-[48px] rounded-2xl bg-zinc-100 text-zinc-600 font-black text-[11px] uppercase tracking-widest"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming || staffWithPayout.length === 0}
            className={cn(
              'flex-[2] min-h-[48px] rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2',
              confirming || staffWithPayout.length === 0
                ? 'bg-zinc-100 text-zinc-300 cursor-not-allowed'
                : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-200'
            )}
          >
            {confirming ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <Check size={18} strokeWidth={3} />
            )}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return modal;
  return createPortal(modal, document.body);
}
