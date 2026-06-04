'use client';

import { X } from 'lucide-react';
import type { StaffTipHistoryEntry } from '@/lib/tip-distribution-display';
import { StaffTipRepartoPanel } from '@/components/tips/StaffTipRepartoPanel';

export function StaffTipDistributionDetailModal({
  entry,
  onClose,
}: {
  entry: StaffTipHistoryEntry | null;
  onClose: () => void;
}) {
  if (!entry) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm animate-in fade-in duration-200 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl animate-in slide-in-from-bottom duration-200 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tip-distribution-detail-title"
      >
        <div className="flex shrink-0 items-center justify-between bg-[#36606F] px-4 py-4 text-white">
          <h2
            id="tip-distribution-detail-title"
            className="text-sm font-black uppercase tracking-wide"
          >
            Reparto
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 transition-all hover:bg-white/20 active:scale-95"
            aria-label="Cerrar"
          >
            <X size={22} strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <StaffTipRepartoPanel entry={entry} />
        </div>
      </div>
    </div>
  );
}
