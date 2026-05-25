'use client'

import { Pencil, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Activa/desactiva edición solo dentro del modal abierto (carta staff). */
export function StaffCartaModalEditToggle({
  active,
  onClick,
  className,
}: {
  active: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-xl text-[#36606F] active:bg-zinc-100',
        active && 'bg-[#36606F]/10',
        className
      )}
      aria-label={active ? 'Salir de edición en este modal' : 'Editar contenido de este modal'}
      aria-pressed={active}
      title={active ? 'Salir de edición' : 'Editar'}
      onClick={onClick}
    >
      {active ? (
        <X className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.5} />
      ) : (
        <Pencil className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.5} />
      )}
    </button>
  )
}
