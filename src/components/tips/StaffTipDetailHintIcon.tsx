import { Plus, Search } from 'lucide-react';

/** Lupa discreta con «+» para abrir detalle. */
export function StaffTipDetailHintIcon() {
  return (
    <span
      className="relative inline-flex h-5 w-5 items-center justify-center text-zinc-300"
      aria-hidden
    >
      <Search size={15} strokeWidth={1.75} className="opacity-60" />
      <Plus
        size={7}
        strokeWidth={3}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-zinc-400/90"
      />
    </span>
  );
}
