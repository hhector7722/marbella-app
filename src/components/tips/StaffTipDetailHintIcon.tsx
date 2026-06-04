import { Plus, Search } from 'lucide-react';

/** Lupa discreta con «+» (misma en Horas, Propina y Penalización). */
export function StaffTipDetailHintIcon() {
  return (
    <span
      className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50"
      aria-hidden
    >
      <Search size={11} strokeWidth={2} className="text-zinc-400/90" />
      <Plus
        size={6}
        strokeWidth={3}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[#36606F]/75"
      />
    </span>
  );
}
