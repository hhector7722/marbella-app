"use client";

import { Calendar, X, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function TimeFilterButton({
  onClick,
  className,
  buttonClassName,
  showLabel = true,
  hasActiveFilter,
  onClear,
  icon: Icon = Calendar,
}: {
  onClick: () => void;
  className?: string;
  buttonClassName?: string;
  showLabel?: boolean;
  hasActiveFilter?: boolean;
  onClear?: () => void;
  icon?: LucideIcon;
}) {
  return (
    <div className={cn("relative inline-flex shrink-0", className)}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1.5",
          "text-[9px] md:text-[10px] font-black uppercase tracking-widest",
          "transition-all outline-none",
          "bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl border border-white/10",
          "min-h-[32px] md:min-h-[36px]",
          buttonClassName
        )}
        aria-label="Filtrar"
      >
        <span data-studio-target="bg" className="inline-flex shrink-0 items-center justify-center">
          <span data-studio-target="asset" className="inline-flex items-center justify-center">
            <Icon className="w-4 h-4 md:w-[18px] md:h-[18px]" />
          </span>
        </span>
        {showLabel && <span data-studio-target="text">Filtrar</span>}
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
            "absolute -top-1.5 -right-1.5",
            "w-5 h-5 md:w-6 md:h-6 rounded-full",
            "bg-rose-500 hover:bg-rose-600 text-white shadow-lg",
            "flex items-center justify-center transition-all active:scale-95",
            "border-2 border-[var(--color-envolvente)]"
          )}
        >
          <X size={10} className="md:size-3" strokeWidth={4} />
        </button>
      )}
    </div>

  );
}

