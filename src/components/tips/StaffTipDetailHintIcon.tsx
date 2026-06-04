import { Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Lupa discreta con «+» (Horas, Propina, Penalización). */
export function StaffTipDetailHintIcon({
  /** Centra el «+» en la lente de la lupa (p. ej. bajo Penalización). */
  alignPlusToLens = false,
}: {
  alignPlusToLens?: boolean;
}) {
  return (
    <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden>
      <Search size={11} strokeWidth={2} className="text-zinc-400/90" />
      <Plus
        size={6}
        strokeWidth={3}
        className={cn(
          'absolute -translate-x-1/2 -translate-y-1/2 text-[#36606F]/75',
          alignPlusToLens ? 'left-[46%] top-[46%]' : 'left-1/2 top-1/2'
        )}
      />
    </span>
  );
}
