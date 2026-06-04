import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Marca de fichaje «no registrada»: círculo rojo con cruz blanca (cabecera tabla) o cruz roja (historial). */
export function FichajeNoRegistradaMark({
  size = 10,
  variant = 'inline',
  className,
}: {
  size?: number;
  variant?: 'inline' | 'badge';
  className?: string;
}) {
  if (variant === 'badge') {
    const box = Math.max(14, Math.round(size * 1.4));
    const icon = Math.max(8, Math.round(size * 0.75));
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full bg-red-600 text-white',
          className
        )}
        style={{ width: box, height: box }}
        title="Salidas no registradas / olvidos de fichaje"
        aria-hidden
      >
        <X size={icon} strokeWidth={3} className="shrink-0" />
      </span>
    );
  }

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
