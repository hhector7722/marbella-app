'use client';

import { formatLocalIsoDateLabel } from '@/lib/tip-distribution-display';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { WorkerListSummary, WorkerPersonRow } from '@/components/staff/WorkerPersonRow';
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

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

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
      subtitle={`${formatLocalIsoDateLabel(startDate, 'd MMM yyyy')} → ${formatLocalIsoDateLabel(endDate, 'd MMM yyyy')}`}
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
      <div>
        <WorkerListSummary
          metrics={[
            { label: 'Lun–Vie', value: fmtMoney(weekdayTotal) },
            { label: 'Sáb–Dom', value: fmtMoney(weekendTotal) },
          ]}
          total={fmtMoney(grandTotal)}
        />

        {staffWithPayout.length === 0 ? (
          <EmptyState instance="tip-confirm-none" variant="none" title="Sin importes a repartir" />
        ) : (
          <div>
            {staffWithPayout.map((s) => (
              <WorkerPersonRow
                key={s.id}
                name={firstName(s.name)}
                subtitle={
                  <>
                    <span>LV {fmtMoney(s.weekdayAmount)}</span>
                    <span className="text-zinc-300">·</span>
                    <span>SD {fmtMoney(s.weekendAmount)}</span>
                  </>
                }
                value={fmtMoney(s.totalAmount)}
              />
            ))}
          </div>
        )}

        <p className="mt-4 text-[11px] leading-relaxed text-zinc-400">
          Se guardará un snapshot en el historial. Los botes actuales no se modifican.
        </p>
      </div>
    </Modal>
  );
}
