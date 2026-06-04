import { Plus, Search } from 'lucide-react';

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
      {alignPlusToLens ? (
        <span
          className="pointer-events-none absolute left-[5px] top-[4px] flex h-[7px] w-[7px] items-center justify-center"
          aria-hidden
        >
          <Plus size={5} strokeWidth={2.5} className="text-[#36606F]/75" />
        </span>
      ) : (
        <Plus
          size={6}
          strokeWidth={3}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[#36606F]/75"
        />
      )}
    </span>
  );
}
