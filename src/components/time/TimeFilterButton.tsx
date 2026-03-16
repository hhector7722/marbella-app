"use client";

import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

export function TimeFilterButton({
  onClick,
  className,
  hasActiveFilter,
  onClear,
}: {
  onClick: () => void;
  className?: string;
  hasActiveFilter?: boolean;
  onClear?: () => void;
}) {
  return (
    <div className={cn("relative inline-flex shrink-0", className)}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1.5",
          "text-[9px] md:text-[10px] font-black uppercase tracking-widest",
          "text-[#36606F] hover:text-[#24414b] transition-colors outline-none",
          "min-h-[32px]"
        )}
        aria-label="Filtro"
      >
        <Calendar className="w-4 h-4 md:w-[18px] md:h-[18px]" />
      </button>
      {hasActiveFilter && onClear && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          aria-label="Limpiar filtro"
          className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-rose-500 flex items-center justify-center shadow-md"
        >
          <span className="block w-2 h-[1.5px] bg-white rotate-45" />
          <span className="block w-2 h-[1.5px] bg-white -rotate-45 absolute" />
        </button>
      )}
    </div>
  );
}

