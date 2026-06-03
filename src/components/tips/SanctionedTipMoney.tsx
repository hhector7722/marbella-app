'use client';

import { cn } from '@/lib/utils';
import { getShadowTipDisplay } from '@/lib/tip-distribution-display';

type SanctionedTipMoneyProps = {
  amount: number;
  shadowAmount?: number | null;
  isSanctioned?: boolean;
  className?: string;
  strikeClassName?: string;
  formatFn?: (n: number) => string;
};

/** Importe pagado; si sancionado muestra shadowAmount tachado (referencia teórica). */
export function SanctionedTipMoney({
  amount,
  shadowAmount,
  isSanctioned,
  className,
  strikeClassName = 'text-zinc-400',
  formatFn,
}: SanctionedTipMoneyProps) {
  const d = getShadowTipDisplay(amount, shadowAmount, isSanctioned, formatFn);
  if (d.shadow) {
    return (
      <span className={cn('line-through tabular-nums', strikeClassName, className)}>{d.shadow}</span>
    );
  }
  return <span className={cn('tabular-nums', className)}>{d.paid}</span>;
}
