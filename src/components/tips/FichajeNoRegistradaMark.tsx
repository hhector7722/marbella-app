import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Misma marca que salida «no registrada» en /staff/history. */
export function FichajeNoRegistradaMark({
  size = 10,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center overflow-visible', className)}
      title="Salida no registrada (olvidó fichar)"
      aria-hidden
    >
      <X size={size} strokeWidth={2.5} className="shrink-0 text-red-500" />
    </span>
  );
}
