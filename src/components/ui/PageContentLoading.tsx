'use client';

import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { cn } from '@/lib/utils';

/**
 * Carga de navegación a pantalla completa: fondo azul sólido, spinner blanco,
 * sin difuminar contenido. Se coloca entre navbar y barra inferior.
 */
export function PageContentLoading({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'fixed left-0 right-0 z-[60] flex items-center justify-center bg-[#5B8FB9]',
        className,
      )}
      style={{
        top: 'calc(3.5rem + env(safe-area-inset-top))',
        bottom: 'calc(5rem + env(safe-area-inset-bottom))',
      }}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Cargando"
    >
      <LoadingSpinner size="xl" className="text-white" />
    </div>
  );
}
