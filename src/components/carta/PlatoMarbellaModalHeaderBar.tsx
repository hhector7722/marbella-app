'use client'

import type { ReactNode } from 'react'
import { ChevronLeft, X } from 'lucide-react'

/** Color de marca del modal Plat Marbella (título, precio, acentos). */
export const PLATO_MARBELLA_BRAND = '#36606F'

export function PlatoMarbellaModalHeaderBar({
  backLabel,
  onBackToPlatos,
  closeLabel = 'Cerrar',
  onClose,
  trailingActions,
}: {
  backLabel: string
  onBackToPlatos: () => void
  closeLabel?: string
  onClose: () => void
  /** Botones a la derecha (p. ej. edición) antes del cierre. */
  trailingActions?: ReactNode
}) {
  return (
    <div className="flex w-full shrink-0 items-center gap-1 bg-white px-3 py-2.5 sm:px-3.5 sm:py-3">
      <button
        type="button"
        className="inline-flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-xl text-[#36606F] active:bg-zinc-100"
        aria-label={backLabel}
        onClick={onBackToPlatos}
      >
        <ChevronLeft className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2.5} />
      </button>
      <span className="min-w-0 flex-1" aria-hidden />
      <div className="flex shrink-0 items-center gap-0.5">
        {trailingActions}
        <button
          type="button"
          className="inline-flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-xl text-[#36606F] active:bg-zinc-100"
          aria-label={closeLabel}
          onClick={onClose}
        >
          <X className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  )
}
