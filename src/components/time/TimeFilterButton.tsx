"use client";

import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

export function TimeFilterButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 md:px-3 py-1.5 rounded-xl",
        "text-[9px] md:text-[10px] font-black uppercase tracking-widest",
        "text-white/90 hover:text-white hover:bg-white/10 transition-all outline-none",
        "min-h-[48px] shrink-0",
        className
      )}
      aria-label="Filtrar"
    >
      <Calendar className="w-4 h-4 md:w-[18px] md:h-[18px]" />
      <span>Filtrar</span>
    </button>
  );
}

