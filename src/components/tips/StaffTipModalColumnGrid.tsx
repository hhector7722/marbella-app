'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type StaffTipModalColumn = {
  label: ReactNode;
  value: ReactNode;
  valueClassName?: string;
};

/** Valor arriba (centrado) y concepto abajo, como la fila de métricas del reparto. */
export function StaffTipModalColumnGrid({ columns }: { columns: StaffTipModalColumn[] }) {
  return (
    <div className="flex items-start gap-0.5">
      {columns.map((col, i) => (
        <div
          key={typeof col.label === 'string' ? col.label : `col-${i}`}
          className="flex min-w-0 flex-1 flex-col items-center px-0.5 py-1"
        >
          <div className="flex h-10 w-full shrink-0 items-center justify-center">
            <span
              className={cn(
                'text-center text-base font-black tabular-nums leading-tight',
                col.valueClassName
              )}
            >
              {col.value}
            </span>
          </div>
          <span className="mt-1 w-full text-center text-[8px] font-bold uppercase leading-tight tracking-wide text-zinc-500 sm:text-[9px]">
            {col.label}
          </span>
        </div>
      ))}
    </div>
  );
}
