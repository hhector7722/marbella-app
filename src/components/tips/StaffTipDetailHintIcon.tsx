import { Search } from 'lucide-react';

/** Lupa discreta (Horas, Propina, Penalización). */
export function StaffTipDetailHintIcon() {
  return (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden>
      <Search size={11} strokeWidth={2} className="text-zinc-400/90" />
    </span>
  );
}
