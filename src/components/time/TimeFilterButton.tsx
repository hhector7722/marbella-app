"use client";

import { Calendar, X } from "lucide-react";
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
    <div className={cn("inline-flex items-center gap-2 shrink-0", className)}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1.5",
          "text-[9px] md:text-[10px] font-black uppercase tracking-widest",
          "transition-colors outline-none",
          "min-h-[32px]"
        )}
        aria-label="Filtrar"
      >
        <Calendar className="w-4 h-4 md:w-[18px] md:h-[18px]" />
        <span>Filtrar</span>
      </button>

      {hasActiveFilter && onClear && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          aria-label="Restablecer filtro"
          className={cn(
            "min-h-[36px] min-w-[36px] w-9 h-9 rounded-xl",
            "bg-rose-500 hover:bg-rose-600 text-white",
            "active:scale-95 transition-all flex items-center justify-center"
          )}
        >
          <X size={14} strokeWidth={3} />
        </button>
      )}
    </div>
  );
}

