import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Pantalla única de carga: tapa también las cabeceras y evita mostrar
 * tarjetas o un contenedor blanco antes de completar imágenes y layout.
 */
export function CartaLoadingOverlay({ className }: { className?: string }) {
  return (
    <div
      className={cn('carta-loading-overlay fixed inset-0 z-[220] flex items-center justify-center', className)}
      role="status"
      aria-live="polite"
      aria-label="Cargando carta"
    >
      <Loader2 className="h-9 w-9 animate-spin text-white" strokeWidth={2.1} aria-hidden />
    </div>
  )
}
