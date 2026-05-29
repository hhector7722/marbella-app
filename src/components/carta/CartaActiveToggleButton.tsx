'use client'

import { Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Mismo estilo que la edición de carta digital: tick verde o círculo rojo. */
export function CartaActiveToggleButton({
  active,
  busy = false,
  onClick,
  className,
  ariaLabel,
}: {
  active: boolean
  busy?: boolean
  onClick: (e: React.MouseEvent) => void
  className?: string
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 shadow-none outline-none ring-0 sm:min-h-[48px] sm:min-w-[48px]',
        className
      )}
      aria-label={ariaLabel ?? (active ? 'Desactivar' : 'Activar')}
      title={active ? 'Activo' : 'Inactivo'}
      onClick={onClick}
    >
      {busy ? (
        <Loader2 className="h-5 w-5 animate-spin text-[#36606F]" />
      ) : active ? (
        <Check className="h-7 w-7 text-emerald-500" strokeWidth={3.25} aria-hidden />
      ) : (
        <span className="block h-4 w-4 rounded-full bg-red-500 ring-2 ring-white" aria-hidden />
      )}
    </button>
  )
}
