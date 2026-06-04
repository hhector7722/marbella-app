'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export function StaffTipBreakdownModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm animate-in fade-in duration-200 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl animate-in slide-in-from-bottom duration-200 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-tip-breakdown-title"
      >
        <div className="flex shrink-0 items-center justify-between bg-[#36606F] px-4 py-4 text-white">
          <h3 id="staff-tip-breakdown-title" className="text-sm font-black uppercase tracking-wide">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 transition-all hover:bg-white/20 active:scale-95"
            aria-label="Cerrar"
          >
            <X size={22} strokeWidth={2.5} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 border-b border-zinc-100 py-3 last:border-0">
      <span className="text-xs font-bold uppercase tracking-wide text-zinc-400">{label}</span>
      <span className="text-sm font-black tabular-nums text-zinc-800">{value}</span>
    </div>
  );
}

export function StaffTipBreakdownRows({
  rows,
}: {
  rows: { label: string; value: string }[];
}) {
  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 px-3">
      {rows.map((r) => (
        <BreakdownRow key={r.label} label={r.label} value={r.value} />
      ))}
    </div>
  );
}
