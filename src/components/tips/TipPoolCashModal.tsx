'use client';

import { useMemo, useState } from 'react';
import { CashDenominationForm, TIP_POOL_CASH_FORM_ID } from '@/components/CashDenominationForm';
import { CashCountFooter } from '@/components/cash/CashCountFooter';
import { Modal } from '@/components/ui/modal';

export type TipPoolType = 'weekday' | 'weekend';

function breakdownToInitialCounts(b: Record<string, number> | null | undefined): Record<number, number> {
  if (!b || typeof b !== 'object') return {};
  return Object.fromEntries(
    Object.entries(b)
      .map(([k, v]) => [Number(k), Number(v)] as const)
      .filter(([k]) => !Number.isNaN(k))
  );
}

export function TipPoolCashModal({
  open,
  poolType,
  cashBreakdown,
  onClose,
  onSave,
}: {
  open: boolean;
  poolType: TipPoolType;
  cashBreakdown: Record<string, number> | null | undefined;
  onClose: () => void;
  onSave: (total: number, breakdown: Record<string, number>, notes: string) => void | Promise<void>;
}) {
  const [total, setTotal] = useState(0);

  const initialCounts = useMemo(
    () => breakdownToInitialCounts(cashBreakdown),
    [cashBreakdown]
  );

  if (!open) return null;

  const isWeekday = poolType === 'weekday';
  const title = isWeekday ? 'Propina entre semana' : 'Propina fin de semana';
  const usageLabel = isWeekday ? 'Bote propina entre semana' : 'Bote propina fin de semana';

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      variant="amplify"
      layer="base"
      instance={isWeekday ? 'tips-cash-weekday' : 'tips-cash-weekend'}
      headerTone="petroleum"
      usageId={`tips-cash-${poolType}`}
      usageLabel={usageLabel}
      footer={
        <CashCountFooter
          total={total}
          instancePrefix={`tips-cash-${poolType}`}
          onCancel={onClose}
          saveType="submit"
          saveForm={TIP_POOL_CASH_FORM_ID}
        />
      }
    >
      <CashDenominationForm
        key={`tip-cash-${poolType}`}
        type="in"
        boxName={title}
        formId={TIP_POOL_CASH_FORM_ID}
        onCancel={onClose}
        onSubmit={(nextTotal, breakdown, notes) => {
          const normalizedBreakdown = Object.fromEntries(
            Object.entries(breakdown).map(([k, v]) => [String(k), Number(v)])
          );
          return onSave(nextTotal, normalizedBreakdown, notes);
        }}
        onTotalChange={setTotal}
        initialCounts={initialCounts}
        availableStock={{}}
        submitLabel="Guardar bote"
        variant="tipPool"
      />
    </Modal>
  );
}
