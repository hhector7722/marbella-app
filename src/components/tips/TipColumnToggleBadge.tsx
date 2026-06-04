import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FichajeNoRegistradaMark } from '@/components/tips/FichajeNoRegistradaMark';

/** Círculo verde con «+» blanco (expandir columnas de horas / propinas). */
export function TipExpandBadge({ size = 10, className }: { size?: number; className?: string }) {
  const box = Math.max(size < 9 ? 12 : 14, Math.round(size * 1.4));
  const icon = Math.max(8, Math.round(size * 0.75));
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white',
        className
      )}
      style={{ width: box, height: box }}
      aria-hidden
    >
      <Plus size={icon} strokeWidth={3} className="shrink-0" />
    </span>
  );
}

/** Círculo rojo con cruz blanca (columna penalización / olvidos). */
export function TipSinRegHeaderBadge({ size = 10, className }: { size?: number; className?: string }) {
  return <FichajeNoRegistradaMark size={size} variant="badge" className={className} />;
}
