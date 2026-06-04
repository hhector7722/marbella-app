'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Modal staff: siempre centrado y más estrecho que la página. */
export const STAFF_TIP_MODAL_PANEL_CLASS =
  'flex w-[calc(100%-2rem)] max-w-[min(20rem,calc(100vw-2rem))] max-h-[min(88vh,28rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl';

type StaffTipModalShellProps = {
  title: string;
  titleId?: string;
  onClose: () => void;
  children: ReactNode;
  zClass?: string;
  bodyClassName?: string;
};

export function StaffTipModalShell({
  title,
  titleId = 'staff-tip-modal-title',
  onClose,
  children,
  zClass = 'z-[120]',
  bodyClassName,
}: StaffTipModalShellProps) {
  return (
    <div
      className={cn(
        'fixed inset-0 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200',
        zClass
      )}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={cn(STAFF_TIP_MODAL_PANEL_CLASS, 'animate-in zoom-in-95 duration-200')}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 bg-[#36606F] px-3 py-3 text-white">
          <h2 id={titleId} className="min-w-0 truncate text-xs font-black uppercase tracking-wide">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 transition-all hover:bg-white/20 active:scale-95"
            aria-label="Cerrar"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>
        <div className={cn('flex-1 overflow-y-auto p-3', bodyClassName)}>{children}</div>
      </div>
    </div>
  );
}
