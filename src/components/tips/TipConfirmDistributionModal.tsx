'use client';

import { formatLocalIsoDateLabel } from '@/lib/tip-distribution-display';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';
import { periodRangeSummary } from '@/lib/usage/modal-apply';

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
  const trackTipConfirm = useTrackModalApply('tip-confirm-distribution', 'Confirmar reparto propinas');
  const grandTotal = weekdayTotal + weekendTotal;
  const staffWithPayout = staff.filter(
    (s) => Math.abs(s.totalAmount) > 0.005 && !s.isSanctioned
  );

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Confirmar reparto"
      variant="standard"
      layer="base"
      instance="tip-confirm-distribution"
      headerTone="petroleum"
      usageId="tip-confirm-distribution"
      usageLabel="Confirmar reparto propinas"
      loading={confirming}
      hideCloseButton={confirming}
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            instance="tip-confirm-distribution-cancel"
            onClick={onClose}
            disabled={confirming}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            instance="tip-confirm-distribution-submit"
            disabled={confirming || staffWithPayout.length === 0}
            loading={confirming}
            loadingLabel="Confirmando…"
            onClick={() => {
              trackTipConfirm(
                `${periodRangeSummary(startDate, endDate)} · ${grandTotal.toFixed(2)} €`,
                { employeeCount: String(staffWithPayout.length) }
              );
              onConfirm();
            }}
          >
            Confirmar
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2 rounded-2xl border border-zinc-100 bg-zinc-50 p-3 text-sm">
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
          <p className="font-black text-emerald-700">
            Total botes: <span className="tabular-nums">{grandTotal.toFixed(2)} €</span>
          </p>
        </div>

        <div>
          <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">
            Empleados ({staffWithPayout.length})
          </p>
          <ul className="max-h-48 space-y-1.5 overflow-y-auto">
            {staffWithPayout.length === 0 ? (
              <li className="py-4 text-center text-sm font-bold text-zinc-400">Sin importes a repartir</li>
            ) : (
              staffWithPayout.map((s) => (
                <li
                  key={s.id}
                  className="flex min-h-[44px] items-center justify-between gap-2 rounded-xl border border-zinc-100 px-3 py-2"
                >
                  <span className="truncate text-sm font-black text-zinc-800">
                    {(s.name || '').trim().split(/\s+/)[0] || s.name}
                  </span>
                  <span className="shrink-0 text-sm font-black tabular-nums text-emerald-600">
                    {fmtMoney(s.totalAmount)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>

        <p className="text-[11px] font-bold leading-snug text-zinc-500">
          Se guardará un snapshot en el historial. Los botes actuales no se modifican.
        </p>
      </div>
    </Modal>
  );
}
