'use client';

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type DiscretePanelSpinnerProps = {
  className?: string;
  label?: string;
};

/** Spinner pequeño para panel entrante durante transiciones (nunca pantalla vacía). */
export function DiscretePanelSpinner({
  className,
  label = 'Cargando',
}: DiscretePanelSpinnerProps) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 z-20 flex items-center justify-center',
        className
      )}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="flex min-h-12 min-w-12 items-center justify-center rounded-full bg-[#36606F]/10">
        <Loader2
          className="h-5 w-5 animate-spin text-[#36606F]/70"
          aria-hidden
        />
      </div>
    </div>
  );
}
